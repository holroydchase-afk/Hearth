// A3: the web build keeps no photo files (a shared computer is a different risk); photos load from the network.
import type { MediaStore } from '../media/diskCache';
import type { KV } from './kv';

export const fileMediaStore: MediaStore | null = null;
export const mediaKeyStore: KV | null = null;
