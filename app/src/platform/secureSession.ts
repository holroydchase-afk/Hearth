// Supabase session storage. Sessions can exceed SecureStore's ~2 KB comfort limit, so the
// session JSON is AES-256-GCM encrypted into AsyncStorage and only the 32-byte key lives in
// the Keychain / Keystore (the "LargeSecureStore" pattern). Signed in for months (JOIN-5).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { gcm } from '@noble/ciphers/aes';
import { fromBase64, toBase64 } from '../crypto/base64';
import { randomBytes } from '../crypto/random';

const enc = new TextEncoder();
const dec = new TextDecoder();

async function keyFor(name: string, create: boolean): Promise<Uint8Array | null> {
  const k = await SecureStore.getItemAsync(`hk_${name}`);
  if (k) return fromBase64(k);
  if (!create) return null;
  const fresh = randomBytes(32);
  await SecureStore.setItemAsync(`hk_${name}`, toBase64(fresh));
  return fresh;
}

const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const blob = await AsyncStorage.getItem(`hs_${key}`);
    const k = await keyFor(safe(key), false);
    if (!blob || !k) return null;
    try {
      const raw = fromBase64(blob);
      return dec.decode(gcm(k, raw.subarray(0, 12)).decrypt(raw.subarray(12)));
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = (await keyFor(safe(key), true))!;
    const nonce = randomBytes(12);
    const ct = gcm(k, nonce).encrypt(enc.encode(value));
    const out = new Uint8Array(12 + ct.length);
    out.set(nonce);
    out.set(ct, 12);
    await AsyncStorage.setItem(`hs_${key}`, toBase64(out));
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(`hs_${key}`);
    await SecureStore.deleteItemAsync(`hk_${safe(key)}`);
  },
};
