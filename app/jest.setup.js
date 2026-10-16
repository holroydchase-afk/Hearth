/* global jest */
// Deterministic, Node-backed stand-ins for native modules used by pure code.
const nodeCrypto = require('crypto');

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n) => new Uint8Array(require('crypto').randomBytes(n)),
  randomUUID: () => require('crypto').randomUUID(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-secure-store', () => {
  const m = new Map();
  return {
    getItemAsync: async (k) => (m.has(k) ? m.get(k) : null),
    setItemAsync: async (k, v) => { m.set(k, v); },
    deleteItemAsync: async (k) => { m.delete(k); },
  };
});

jest.mock('./src/notify/push', () => ({
  registerForPush: jest.fn(async () => null),
  listenForArrivals: jest.fn(() => () => {}),
  useNotificationTaps: () => {},
}));

if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
  globalThis.crypto = nodeCrypto.webcrypto;
}

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
