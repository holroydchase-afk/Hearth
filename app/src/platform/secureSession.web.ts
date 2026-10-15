// Web is a test harness only; keep the session in localStorage.
export const secureSessionStorage = {
  getItem: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
  setItem: async (k: string, v: string) => { globalThis.localStorage?.setItem(k, v); },
  removeItem: async (k: string) => { globalThis.localStorage?.removeItem(k); },
};
