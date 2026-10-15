import { getRandomBytes } from 'expo-crypto';

/** Cryptographically secure random bytes (expo-crypto on device, WebCrypto on web). */
export function randomBytes(n: number): Uint8Array {
  return getRandomBytes(n);
}

export function uuid(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomUUID } = require('expo-crypto') as typeof import('expo-crypto');
  return randomUUID();
}
