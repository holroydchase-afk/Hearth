// aes-256-gcm-chunked-v1: the client-side format for media bytes stored in B2.
//
// The backend never decrypts, so only clients must agree on this layout:
//   ciphertext = chunk_0 || chunk_1 || ... || chunk_last
//   chunk_i    = nonce(12) || AES-256-GCM(key, nonce, plaintext_i) (ciphertext || tag(16))
//   nonce      = file_prefix(7, random per file) || be32(i) || last_flag(1: 0x01 on the last chunk)
// Plaintext chunks are 64 KiB (the last may be shorter, or empty for an empty file).
// Binding the index and the last flag into the nonce makes reordering, dropping
// or truncating chunks fail authentication (the STREAM construction).
import { gcm } from '@noble/ciphers/aes.js';
import { fromBase64 } from './base64';
import { randomBytes } from './random';

export const ENC_SCHEME = 'aes-256-gcm-chunked-v1';
export const CHUNK_SIZE = 64 * 1024;
const NONCE = 12;
const TAG = 16;
const OVERHEAD = NONCE + TAG;

export function encryptedSize(plainLength: number): number {
  const chunks = Math.max(1, Math.ceil(plainLength / CHUNK_SIZE));
  return plainLength + chunks * OVERHEAD;
}

function keyBytes(k: Uint8Array | string): Uint8Array {
  const key = typeof k === 'string' ? fromBase64(k) : k;
  if (key.length !== 32) throw new Error('media key must be 32 bytes');
  return key;
}

function nonceFor(prefix: Uint8Array, index: number, last: boolean): Uint8Array {
  const n = new Uint8Array(NONCE);
  n.set(prefix, 0);
  n[7] = (index >>> 24) & 0xff;
  n[8] = (index >>> 16) & 0xff;
  n[9] = (index >>> 8) & 0xff;
  n[10] = index & 0xff;
  n[11] = last ? 1 : 0;
  return n;
}

export function encryptMedia(plain: Uint8Array, k: Uint8Array | string, random: (n: number) => Uint8Array = randomBytes): Uint8Array {
  const key = keyBytes(k);
  const prefix = random(7);
  const chunks = Math.max(1, Math.ceil(plain.length / CHUNK_SIZE));
  const out = new Uint8Array(encryptedSize(plain.length));
  let o = 0;
  for (let i = 0; i < chunks; i++) {
    const nonce = nonceFor(prefix, i, i === chunks - 1);
    const pt = plain.subarray(i * CHUNK_SIZE, Math.min(plain.length, (i + 1) * CHUNK_SIZE));
    const ct = gcm(key, nonce).encrypt(pt);
    out.set(nonce, o);
    out.set(ct, o + NONCE);
    o += NONCE + ct.length;
  }
  return out;
}

export function decryptMedia(cipher: Uint8Array, k: Uint8Array | string): Uint8Array {
  const key = keyBytes(k);
  if (cipher.length < OVERHEAD) throw new Error('ciphertext too short');
  const full = CHUNK_SIZE + OVERHEAD;
  const total = Math.ceil(cipher.length / full);
  const out = new Uint8Array(cipher.length - total * OVERHEAD);
  let prefix: Uint8Array | null = null;
  let o = 0;
  for (let i = 0; i < total; i++) {
    const start = i * full;
    const end = Math.min(cipher.length, start + full);
    const nonce = cipher.subarray(start, start + NONCE);
    if (nonce.length !== NONCE) throw new Error('truncated');
    prefix ??= nonce.subarray(0, 7);
    const expected = nonceFor(prefix, i, i === total - 1);
    for (let j = 0; j < NONCE; j++) if (nonce[j] !== expected[j]) throw new Error('chunk out of order or truncated');
    const pt = gcm(key, expected).decrypt(cipher.subarray(start + NONCE, end)); // throws on tamper
    out.set(pt, o);
    o += pt.length;
  }
  return out;
}
