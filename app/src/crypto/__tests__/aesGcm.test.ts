// R4 / A1 (DEC-29): media encryption runs on the fastest AES-GCM the runtime has, and every provider
// produces the same bytes. Expo Go (Hermes, no crypto.subtle) keeps the JavaScript cipher.
import { webcrypto } from 'crypto';
import { nobleAesGcm, pickAesGcm, registerNativeAesGcm, webCryptoAesGcm, type AesGcm } from '../aesGcm';
import { CHUNK_SIZE, decryptMedia, decryptMediaAsync, encryptMedia, encryptMediaAsync } from '../media';

const hex = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));
const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const providers: [string, AesGcm][] = [['noble', nobleAesGcm], ['webcrypto', webCryptoAesGcm(subtle)]];

// NIST GCM test vector (gcmEncryptExtIV256, Count 0 with 128-bit tag, no AAD): McGrew and Viega, test case 15.
const KAT = {
  key: hex('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308'),
  iv: hex('cafebabefacedbaddecaf888'),
  pt: hex('d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255'),
  ct: hex('522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad'),
  tag: hex('b094dac5d93471bdec1a502270e3cc6c'),
};

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff);
const fixedRandom = (n: number) => Uint8Array.from({ length: n }, (_, i) => i + 1);

describe.each(providers)('A1 AES-256-GCM provider: %s', (_name, aes) => {
  it('PERF-ENC-2 matches the NIST known-answer vector', async () => {
    const out = await aes.encrypt(KAT.key, KAT.iv, KAT.pt);
    expect(Buffer.from(out).toString('hex')).toBe(Buffer.from(KAT.ct).toString('hex') + Buffer.from(KAT.tag).toString('hex'));
    expect(Buffer.from(await aes.decrypt(KAT.key, KAT.iv, out))).toEqual(Buffer.from(KAT.pt));
  });

  it('PERF-ENC-2 rejects a tampered tag', async () => {
    const out = await aes.encrypt(KAT.key, KAT.iv, KAT.pt);
    out[out.length - 1] = out[out.length - 1]! ^ 1;
    await expect(aes.decrypt(KAT.key, KAT.iv, out)).rejects.toThrow();
  });

  it.each([0, 1000, CHUNK_SIZE, 2 * CHUNK_SIZE + 5])(
    'PERF-ENC-3 encryptMediaAsync gives the same bytes as the JavaScript path for %i bytes, and both decrypt it',
    async (n) => {
      const key = bytes(32);
      const plain = bytes(n);
      const sync = encryptMedia(plain, key, fixedRandom);
      const viaProvider = await encryptMediaAsync(plain, key, { aes, random: fixedRandom });
      expect(Buffer.from(viaProvider)).toEqual(Buffer.from(sync));
      expect(Buffer.from(await decryptMediaAsync(sync, key, { aes }))).toEqual(Buffer.from(plain));
      expect(Buffer.from(decryptMedia(viaProvider, key))).toEqual(Buffer.from(plain));
    },
  );

  it('PERF-ENC-3 decryptMediaAsync refuses reordered chunks', async () => {
    const key = bytes(32);
    const ct = encryptMedia(bytes(2 * CHUNK_SIZE + 5), key, fixedRandom);
    const full = CHUNK_SIZE + 28;
    const swapped = new Uint8Array(ct);
    swapped.set(ct.subarray(full, 2 * full), 0);
    swapped.set(ct.subarray(0, full), full);
    await expect(decryptMediaAsync(swapped, key, { aes })).rejects.toThrow();
  });
});

describe('A1 provider choice', () => {
  afterEach(() => registerNativeAesGcm(null));

  it('PERF-ENC-1 Expo Go (no crypto.subtle, no native module) uses the JavaScript cipher', () => {
    expect(pickAesGcm({ subtle: undefined }).name).toBe('noble');
  });

  it('PERF-ENC-1 the web build uses the browser\'s crypto.subtle', () => {
    expect(pickAesGcm({ subtle }).name).toBe('webcrypto');
  });

  it('PERF-ENC-1 a development build with the native module registered uses it first', () => {
    registerNativeAesGcm({ ...nobleAesGcm, name: 'native' });
    expect(pickAesGcm({ subtle }).name).toBe('native');
  });
});
