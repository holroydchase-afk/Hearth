// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// A1 (DEC-29): AES-256-GCM providers for media bytes. Every provider produces the same bytes
// (ciphertext || 16-byte tag), so the stored format (aes-256-gcm-chunked-v1) doesn't change.
//   native     a development build registers one at start-up (react-native-quick-crypto); fastest on phones
//   webcrypto  the browser's crypto.subtle (the web build); native code in the browser
//   noble      @noble/ciphers in JavaScript; the only option in Expo Go (Hermes has no crypto.subtle)
import { gcm } from '@noble/ciphers/aes.js';

export interface AesGcmKey {
  encrypt(nonce: Uint8Array, plain: Uint8Array): Promise<Uint8Array>;
  decrypt(nonce: Uint8Array, sealed: Uint8Array): Promise<Uint8Array>;
}
export interface AesGcm {
  readonly name: string;
  /** Prepare a 32-byte key once per file. */
  forKey(key: Uint8Array): Promise<AesGcmKey>;
  encrypt(key: Uint8Array, nonce: Uint8Array, plain: Uint8Array): Promise<Uint8Array>;
  decrypt(key: Uint8Array, nonce: Uint8Array, sealed: Uint8Array): Promise<Uint8Array>;
}

function fromKeyed(name: string, forKey: (key: Uint8Array) => Promise<AesGcmKey>): AesGcm {
  return {
    name,
    forKey,
    encrypt: async (k, n, p) => (await forKey(k)).encrypt(n, p),
    decrypt: async (k, n, c) => (await forKey(k)).decrypt(n, c),
  };
}

export const nobleAesGcm: AesGcm = fromKeyed('noble', async (key) => ({
  encrypt: async (nonce, plain) => gcm(key, nonce).encrypt(plain),
  decrypt: async (nonce, sealed) => gcm(key, nonce).decrypt(sealed),
}));

export function webCryptoAesGcm(subtle: SubtleCrypto): AesGcm {
  return fromKeyed('webcrypto', async (key) => {
    const k = await subtle.importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    return {
      encrypt: async (nonce, plain) => new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, k, plain as BufferSource)),
      decrypt: async (nonce, sealed) => new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, k, sealed as BufferSource)),
    };
  });
}

let native: AesGcm | null = null;
/** A development build calls this at start-up with its native provider. Expo Go never does. */
export function registerNativeAesGcm(p: AesGcm | null): void {
  native = p;
}

/** The fastest provider this runtime has: native, then crypto.subtle, then JavaScript. */
export function pickAesGcm(env: { subtle?: SubtleCrypto | undefined } = { subtle: (globalThis as { crypto?: Crypto }).crypto?.subtle }): AesGcm {
  if (native) return native;
  if (env.subtle && typeof env.subtle.importKey === 'function') return webCryptoAesGcm(env.subtle);
  return nobleAesGcm;
}
