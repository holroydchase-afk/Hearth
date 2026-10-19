import * as ExpoCrypto from 'expo-crypto';

// Only getRandomValues: expo-crypto's getRandomBytes falls back to Math.random in dev builds without the old
// bridge hook, which includes Expo Go on RN 0.86 (MS4). One call fills at most 65536 bytes (the WebCrypto limit).
const CHUNK = 65536;

/** Cryptographically secure random bytes (native on device, WebCrypto on web). Throws if neither exists. */
export function randomBytes(n: number): Uint8Array {
  const fill = (ExpoCrypto as { getRandomValues?: (a: Uint8Array) => unknown }).getRandomValues;
  if (typeof fill !== 'function') throw new Error('No secure random source on this device');
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += CHUNK) fill(out.subarray(i, Math.min(n, i + CHUNK)));
  return out;
}

export function uuid(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomUUID } = require('expo-crypto') as typeof import('expo-crypto');
  return randomUUID();
}
