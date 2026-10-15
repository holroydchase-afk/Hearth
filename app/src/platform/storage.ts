import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KV } from './kv';

export const asyncStorageKV: KV = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};
