import type { KV } from './kv';
import { webKV } from './webStorage';

// Web: the same localStorage keys AsyncStorage uses there, but a blocked browser keeps them in memory (HARD-7).
export const asyncStorageKV: KV = webKV();
