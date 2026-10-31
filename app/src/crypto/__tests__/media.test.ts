// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import { CHUNK_SIZE, ENC_SCHEME, decryptMedia, encryptMedia, encryptedSize } from '../media';
import { fromBase64, toBase64 } from '../base64';

const key = () => new Uint8Array(require('crypto').randomBytes(32));
const bytes = (n: number) => {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 0xff;
  return b;
};

describe('BETA-SHARE-3 media encryption (AES-256-GCM, chunked)', () => {
  it('uses the scheme name sign-media hands out', () => {
    expect(ENC_SCHEME).toBe('aes-256-gcm-chunked-v1');
  });

  it.each([0, 1, 1000, CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1, 3 * CHUNK_SIZE + 17])(
    'round-trips %i bytes and the ciphertext length is predictable',
    (n) => {
      const k = key();
      const plain = bytes(n);
      const ct = encryptMedia(plain, k);
      expect(ct.length).toBe(encryptedSize(n));
      expect(Buffer.from(decryptMedia(ct, k))).toEqual(Buffer.from(plain));
    },
  );

  it('accepts the base64 key exactly as sign-media returns it', () => {
    const k = key();
    const ct = encryptMedia(bytes(500), toBase64(k));
    expect(decryptMedia(ct, toBase64(k)).length).toBe(500);
  });

  it('ciphertext of a JPEG does not look like a JPEG', () => {
    const jpeg = bytes(5000);
    jpeg[0] = 0xff; jpeg[1] = 0xd8; jpeg[2] = 0xff;
    const ct = encryptMedia(jpeg, key());
    expect([ct[0], ct[1], ct[2]]).not.toEqual([0xff, 0xd8, 0xff]);
    expect(Buffer.from(ct).includes(Buffer.from(jpeg.subarray(0, 64)))).toBe(false);
  });

  it('two encryptions of the same bytes differ (fresh nonces)', () => {
    const k = key();
    expect(Buffer.from(encryptMedia(bytes(100), k))).not.toEqual(Buffer.from(encryptMedia(bytes(100), k)));
  });

  it('rejects a wrong key, a flipped bit, a dropped final chunk and swapped chunks', () => {
    const k = key();
    const ct = encryptMedia(bytes(2 * CHUNK_SIZE + 5), k);
    expect(() => decryptMedia(ct, key())).toThrow();
    const flipped = ct.slice(); flipped[40] = (flipped[40] ?? 0) ^ 1;
    expect(() => decryptMedia(flipped, k)).toThrow();
    const full = CHUNK_SIZE + 28;
    expect(() => decryptMedia(ct.subarray(0, 2 * full), k)).toThrow();
    const swapped = new Uint8Array(ct.length);
    swapped.set(ct.subarray(full, 2 * full), 0);
    swapped.set(ct.subarray(0, full), full);
    swapped.set(ct.subarray(2 * full), 2 * full);
    expect(() => decryptMedia(swapped, k)).toThrow();
  });

  it('refuses keys that are not 32 bytes', () => {
    expect(() => encryptMedia(bytes(10), new Uint8Array(16))).toThrow();
  });
});

describe('base64', () => {
  it('round-trips every byte value and matches Node', () => {
    const all = new Uint8Array(256).map((_, i) => i);
    for (const n of [0, 1, 2, 3, 4, 255, 256]) {
      const b = all.subarray(0, n);
      expect(toBase64(b)).toBe(Buffer.from(b).toString('base64'));
      expect(Buffer.from(fromBase64(toBase64(b)))).toEqual(Buffer.from(b));
    }
  });
});
