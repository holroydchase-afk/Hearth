// MSG-4: MLS runs with no WebCrypto (Expo Go / Hermes has no crypto.subtle), and Hearth's noble-only
// ciphersuite talks to ts-mls's own WebCrypto one, so it is real RFC 9420 / RFC 9180 and not a private dialect.
import {
  createApplicationMessage, createCommit, createGroup, defaultCapabilities, defaultLifetime, emptyPskIndex,
  generateKeyPackage, getCiphersuiteFromName, joinGroup, processPrivateMessage,
  type CiphersuiteImpl,
} from 'ts-mls';
import { CipherSuite, DhkemX25519HkdfSha256, HkdfSha256 } from '@hpke/core';
import { Chacha20Poly1305 } from '@hpke/chacha20poly1305';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { makeGenericHpke } from 'ts-mls/crypto/implementation/hpke.js';
import { makeHashImpl } from 'ts-mls/crypto/implementation/default/makeHashImpl.js';
import { makeKdf, makeKdfImpl } from 'ts-mls/crypto/implementation/default/makeKdfImpl.js';
import { makeNobleSignatureImpl } from 'ts-mls/crypto/implementation/default/makeNobleSignatureImpl.js';
import { HEARTH_SUITE, hearthCiphersuite } from '../mlsCrypto';

// The reference: ts-mls's own WebCrypto pieces (@hpke/core HPKE, WebCrypto HMAC/HKDF/Ed25519), assembled here
// because getCiphersuiteImpl loads the ChaCha AEAD with a dynamic import that Jest can't run.
async function referenceSuite(): Promise<CiphersuiteImpl> {
  const aead = {
    encrypt: async (k: Uint8Array, n: Uint8Array, a: Uint8Array, p: Uint8Array) => chacha20poly1305(k, n, a).encrypt(p),
    decrypt: async (k: Uint8Array, n: Uint8Array, a: Uint8Array, c: Uint8Array) => chacha20poly1305(k, n, a).decrypt(c),
  };
  const cs = new CipherSuite({ kem: new DhkemX25519HkdfSha256(), kdf: new HkdfSha256(), aead: new Chacha20Poly1305() });
  const real = getCiphersuiteFromName(HEARTH_SUITE);
  return {
    name: HEARTH_SUITE,
    hash: makeHashImpl(globalThis.crypto.subtle, real.hash),
    kdf: makeKdfImpl(makeKdf(real.hpke.kdf)),
    signature: await makeNobleSignatureImpl(real.signature),
    hpke: await makeGenericHpke(real.hpke, aead as never, cs),
    rng: { randomBytes: (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)) },
  };
}

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

async function roundTrip(alice: CiphersuiteImpl, bob: CiphersuiteImpl, text: string): Promise<string[]> {
  const a = await generateKeyPackage({ credentialType: 'basic', identity: enc('alice') }, defaultCapabilities(), defaultLifetime, [], alice);
  let ag = await createGroup(enc('group-1'), a.publicPackage, a.privatePackage, [], alice);
  const b = await generateKeyPackage({ credentialType: 'basic', identity: enc('bob') }, defaultCapabilities(), defaultLifetime, [], bob);
  const commit = await createCommit({ state: ag, cipherSuite: alice }, { extraProposals: [{ proposalType: 'add', add: { keyPackage: b.publicPackage } }] });
  ag = commit.newState;
  let bg = await joinGroup(commit.welcome!, b.publicPackage, b.privatePackage, emptyPskIndex, bob, ag.ratchetTree);
  const toBob = await createApplicationMessage(ag, enc(text), alice);
  const gotBob = await processPrivateMessage(bg, toBob.privateMessage, emptyPskIndex, bob);
  if (gotBob.kind !== 'applicationMessage') throw new Error('expected an application message');
  bg = gotBob.newState;
  const toAlice = await createApplicationMessage(bg, enc('reply: ' + text), bob);
  const gotAlice = await processPrivateMessage(commit.newState, toAlice.privateMessage, emptyPskIndex, alice);
  if (gotAlice.kind !== 'applicationMessage') throw new Error('expected an application message');
  return [dec(gotBob.message), dec(gotAlice.message)];
}

describe('MSG-4 MLS crypto without WebCrypto', () => {
  const realCrypto = globalThis.crypto;

  it('MSG-4: uses ciphersuite 3 (X25519, ChaCha20-Poly1305, SHA-256, Ed25519)', () => {
    expect(HEARTH_SUITE).toBe('MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519');
  });

  it('MSG-4: a group of two sends and reads messages with crypto.subtle gone', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: <T extends ArrayBufferView>(a: T) => realCrypto.getRandomValues(a as never) as T },
      configurable: true,
    });
    try {
      expect((globalThis.crypto as Crypto).subtle).toBeUndefined();
      const impl = await hearthCiphersuite();
      expect(await roundTrip(impl, impl, 'Hi Bebar')).toEqual(['Hi Bebar', 'reply: Hi Bebar']);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
    }
  });

  it('MSG-4: talks both ways with ts-mls\'s own WebCrypto ciphersuite (interop)', async () => {
    const ours = await hearthCiphersuite();
    const theirs = await referenceSuite();
    expect(await roundTrip(ours, theirs, 'ours to theirs')).toEqual(['ours to theirs', 'reply: ours to theirs']);
    expect(await roundTrip(theirs, ours, 'theirs to ours')).toEqual(['theirs to ours', 'reply: theirs to ours']);
  });

  it('MSG-4: HPKE seal/open and export match the reference both ways', async () => {
    const ours = (await hearthCiphersuite()).hpke;
    const theirs = (await referenceSuite()).hpke;
    const kp = await ours.generateKeyPair();
    const pubBytes = await ours.exportPublicKey(kp.publicKey);
    const privBytes = await ours.exportPrivateKey(kp.privateKey);
    const theirPub = await theirs.importPublicKey(pubBytes);
    const theirPriv = await theirs.importPrivateKey(privBytes);
    const info = enc('info'); const aad = enc('aad');
    const s1 = await theirs.seal(theirPub, enc('to ours'), info, aad);
    expect(dec(await ours.open(kp.privateKey, s1.enc, s1.ct, info, aad))).toBe('to ours');
    const s2 = await ours.seal(kp.publicKey, enc('to theirs'), info, aad);
    expect(dec(await theirs.open(theirPriv, s2.enc, s2.ct, info, aad))).toBe('to theirs');
    const e1 = await ours.exportSecret(kp.publicKey, enc('ctx'), 32, info);
    expect(await theirs.importSecret(theirPriv, enc('ctx'), e1.enc, 32, info)).toEqual(e1.secret);
    const ikm = enc('derive me please, 32 bytes or so!!');
    const d1 = await ours.deriveKeyPair(ikm); const d2 = await theirs.deriveKeyPair(ikm);
    expect(await ours.exportPublicKey(d1.publicKey)).toEqual(await theirs.exportPublicKey(d2.publicKey));
  });

  it('MSG-4: a tampered ciphertext is refused', async () => {
    const h = (await hearthCiphersuite()).hpke;
    const kp = await h.generateKeyPair();
    const s = await h.seal(kp.publicKey, enc('secret'), enc('i'));
    s.ct[0] = s.ct[0]! ^ 1;
    await expect(h.open(kp.privateKey, s.enc, s.ct, enc('i'))).rejects.toThrow();
  });
});
