// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
//
// An MLS ciphersuite built only on the audited noble libraries, so the messenger runs where there is no
// WebCrypto (Expo Go / Hermes, older browsers). ts-mls's own providers call crypto.subtle for HMAC, X25519 and Ed25519.
//
// Suite 3 of RFC 9420: MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519.
// HPKE (RFC 9180) is base mode only (MLS uses no PSK or auth modes), single-shot seal/open plus export.
// Interop with ts-mls's WebCrypto suite is tested in Hearth (app/src/messenger/__tests__/mlsCrypto.test.ts).
// Not yet reviewed by anyone outside the project (see README).
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { expand, extract } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { CiphersuiteImpl, CiphersuiteName } from 'ts-mls';

export const MESSENGER_SUITE: CiphersuiteName = 'MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519';

/** Cryptographically secure random bytes. Never Math.random: every key comes from here. */
export type RandomBytes = (n: number) => Uint8Array;

type Hpke = CiphersuiteImpl['hpke'];
type PublicKey = Parameters<Hpke['exportPublicKey']>[0];
type PrivateKey = Parameters<Hpke['exportPrivateKey']>[0];

// ts-mls types HPKE keys as CryptoKey; it only ever hands them back to this object, so a tagged wrapper is enough.
interface RawKey { type: 'public' | 'private'; raw: Uint8Array }
const pub = (raw: Uint8Array) => ({ type: 'public', raw }) as RawKey as unknown as PublicKey;
const priv = (raw: Uint8Array) => ({ type: 'private', raw }) as RawKey as unknown as PrivateKey;
const raw = (k: PublicKey | PrivateKey) => (k as unknown as RawKey).raw;

const te = new TextEncoder();
function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const i2osp = (n: number, len: number) => {
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) { out[i] = n & 0xff; n >>>= 8; }
  return out;
};
const EMPTY = new Uint8Array(0);

// RFC 9180 identifiers: DHKEM(X25519, HKDF-SHA256) 0x0020, HKDF-SHA256 0x0001, ChaCha20Poly1305 0x0003.
const KEM_ID = i2osp(0x0020, 2);
const KEM_SUITE = cat(te.encode('KEM'), KEM_ID);
const HPKE_SUITE = cat(te.encode('HPKE'), KEM_ID, i2osp(0x0001, 2), i2osp(0x0003, 2));
const HPKE_V1 = te.encode('HPKE-v1');
const NK = 32, NN = 12, NH = 32;

const labeledExtract = (suite: Uint8Array, salt: Uint8Array, label: string, ikm: Uint8Array) =>
  extract(sha256, cat(HPKE_V1, suite, te.encode(label), ikm), salt);
const labeledExpand = (suite: Uint8Array, prk: Uint8Array, label: string, info: Uint8Array, len: number) =>
  expand(sha256, prk, cat(i2osp(len, 2), HPKE_V1, suite, te.encode(label), info), len);

function kemSharedSecret(dh: Uint8Array, kemContext: Uint8Array): Uint8Array {
  const prk = labeledExtract(KEM_SUITE, EMPTY, 'eae_prk', dh);
  return labeledExpand(KEM_SUITE, prk, 'shared_secret', kemContext, NH);
}

function encap(pkR: Uint8Array, random: RandomBytes): { ss: Uint8Array; enc: Uint8Array } {
  const skE = random(32);
  const pkE = x25519.getPublicKey(skE);
  const ss = kemSharedSecret(x25519.getSharedSecret(skE, pkR), cat(pkE, pkR));
  skE.fill(0);
  return { ss, enc: pkE };
}

function decap(enc: Uint8Array, skR: Uint8Array): Uint8Array {
  return kemSharedSecret(x25519.getSharedSecret(skR, enc), cat(enc, x25519.getPublicKey(skR)));
}

function keySchedule(ss: Uint8Array, info: Uint8Array) {
  const pskIdHash = labeledExtract(HPKE_SUITE, EMPTY, 'psk_id_hash', EMPTY);
  const infoHash = labeledExtract(HPKE_SUITE, EMPTY, 'info_hash', info);
  const ctx = cat(new Uint8Array([0]), pskIdHash, infoHash);
  const secret = labeledExtract(HPKE_SUITE, ss, 'secret', EMPTY);
  return {
    key: labeledExpand(HPKE_SUITE, secret, 'key', ctx, NK),
    nonce: labeledExpand(HPKE_SUITE, secret, 'base_nonce', ctx, NN),
    exporter: labeledExpand(HPKE_SUITE, secret, 'exp', ctx, NH),
  };
}

const exportFrom = (exporter: Uint8Array, context: Uint8Array, len: number) =>
  labeledExpand(HPKE_SUITE, exporter, 'sec', context, len);

const makeHpke = (random: RandomBytes): Hpke => ({
  async seal(publicKey, plaintext, info, aad) {
    const { ss, enc } = encap(raw(publicKey), random);
    const { key, nonce } = keySchedule(ss, info);
    return { ct: chacha20poly1305(key, nonce, aad ?? EMPTY).encrypt(plaintext), enc };
  },
  async open(privateKey, kemOutput, ciphertext, info, aad) {
    const { key, nonce } = keySchedule(decap(kemOutput, raw(privateKey)), info);
    return chacha20poly1305(key, nonce, aad ?? EMPTY).decrypt(ciphertext);
  },
  async exportSecret(publicKey, exporterContext, length, info) {
    const { ss, enc } = encap(raw(publicKey), random);
    return { enc, secret: exportFrom(keySchedule(ss, info).exporter, exporterContext, length) };
  },
  async importSecret(privateKey, exporterContext, kemOutput, length, info) {
    return exportFrom(keySchedule(decap(kemOutput, raw(privateKey)), info).exporter, exporterContext, length);
  },
  async importPrivateKey(k) { return priv(Uint8Array.from(k)); },
  async importPublicKey(k) { return pub(Uint8Array.from(k)); },
  async exportPublicKey(k) { return Uint8Array.from(raw(k)); },
  async exportPrivateKey(k) { return Uint8Array.from(raw(k)); },
  async encryptAead(key, nonce, aad, plaintext) { return chacha20poly1305(key, nonce, aad ?? EMPTY).encrypt(plaintext); },
  async decryptAead(key, nonce, aad, ciphertext) { return chacha20poly1305(key, nonce, aad ?? EMPTY).decrypt(ciphertext); },
  async deriveKeyPair(ikm) {
    const prk = labeledExtract(KEM_SUITE, EMPTY, 'dkp_prk', ikm);
    const sk = labeledExpand(KEM_SUITE, prk, 'sk', EMPTY, 32);
    return { privateKey: priv(sk), publicKey: pub(x25519.getPublicKey(sk)) };
  },
  async generateKeyPair() {
    const sk = random(32);
    return { privateKey: priv(sk), publicKey: pub(x25519.getPublicKey(sk)) };
  },
  keyLength: NK,
  nonceLength: NN,
});

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

// ts-mls wipes spent keys with the global crypto.getRandomValues; Hermes may not have one.
function ensureGetRandomValues(random: RandomBytes): void {
  const g = globalThis as { crypto?: { getRandomValues?: unknown } };
  if (typeof g.crypto?.getRandomValues === 'function') return;
  const fill = <T extends ArrayBufferView>(a: T): T => {
    new Uint8Array(a.buffer, a.byteOffset, a.byteLength).set(random(a.byteLength));
    return a;
  };
  if (g.crypto) (g.crypto as { getRandomValues: unknown }).getRandomValues = fill;
  else Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: fill }, configurable: true });
}

/** The suite ts-mls needs. Every key and nonce is drawn from `random`, which must be a secure source. */
export async function messengerCiphersuite(random: RandomBytes): Promise<CiphersuiteImpl> {
  ensureGetRandomValues(random);
  return {
    name: MESSENGER_SUITE,
    hash: {
      async digest(data) { return sha256(data); },
      async mac(key, data) { return hmac(sha256, key, data); },
      async verifyMac(key, mac, data) { return equal(hmac(sha256, key, data), mac); },
    },
    kdf: {
      async extract(salt, ikm) { return extract(sha256, ikm, salt); },
      async expand(prk, info, len) { return expand(sha256, prk, info, len); },
      size: NH,
    },
    signature: {
      async sign(signKey, message) { return ed25519.sign(message, signKey); },
      async verify(publicKey, message, signature) {
        try { return ed25519.verify(signature, message, publicKey, { zip215: false }); } catch { return false; }
      },
      async keygen() {
        const signKey = random(32);
        return { signKey, publicKey: ed25519.getPublicKey(signKey) };
      },
    },
    hpke: makeHpke(random),
    rng: { randomBytes: (n: number) => random(n) },
  };
}
