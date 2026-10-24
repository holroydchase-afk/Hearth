// HARD-7: a browser with storage blocked (private window, strict cookie settings, some embeds) throws on
// window.localStorage itself. Callers get undefined instead and keep things in memory for this visit.
export function webStorage(): Storage | undefined {
  try {
    const s = globalThis.localStorage;
    void s?.length; // some browsers only throw on first use
    return s ?? undefined;
  } catch {
    return undefined;
  }
}

/** A key/value store over localStorage that falls back to memory when storage is blocked or full. */
export function webKV() {
  const mem = new Map<string, string>();
  const get = (k: string) => { try { const v = webStorage()?.getItem(k); if (v != null) return v; } catch { /* blocked */ } return mem.get(k) ?? null; };
  const set = (k: string, v: string) => { mem.set(k, v); try { webStorage()?.setItem(k, v); } catch { /* blocked or full */ } };
  const remove = (k: string) => { mem.delete(k); try { webStorage()?.removeItem(k); } catch { /* blocked */ } };
  return {
    getItem: async (k: string) => get(k),
    setItem: async (k: string, v: string) => set(k, v),
    removeItem: async (k: string) => remove(k),
  };
}
