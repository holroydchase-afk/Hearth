// A3 (DEC-29): encrypted photo files kept on the phone so Photos opens instantly and offline.
// Files hold exactly the ciphertext from B2 (aes-256-gcm-chunked-v1); the keys to open them live in a
// separate keychain-backed store (platform/secureSession.ts) and are wiped at sign-out.

/** Where kept ciphertext files go. Names are `<media_id>.<thumb|display>`. */
export interface MediaStore {
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
  list(): Promise<string[]>;
  clear(): Promise<void>;
}

export function memoryMediaStore(): MediaStore & { dump(): Record<string, Uint8Array> } {
  const m = new Map<string, Uint8Array>();
  return {
    read: async (n) => m.get(n) ?? null,
    write: async (n, b) => { m.set(n, Uint8Array.from(b)); },
    remove: async (n) => { m.delete(n); },
    list: async () => [...m.keys()],
    clear: async () => { m.clear(); },
    dump: () => Object.fromEntries(m),
  };
}
