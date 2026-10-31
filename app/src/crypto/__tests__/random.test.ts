// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// MS4 (privacy-security review, PR #29): expo-crypto's getRandomBytes quietly falls back to Math.random in dev
// builds without the old bridge hook, which is Expo Go on RN 0.86. Keys must only ever come from getRandomValues.
const zeros = (n: number) => new Uint8Array(n); // stands in for the predictable Math.random fallback

function withExpoCrypto(m: Record<string, unknown>) {
  jest.resetModules();
  jest.doMock('expo-crypto', () => ({ randomUUID: () => 'x', ...m }));
}
afterEach(() => jest.dontMock('expo-crypto'));

describe('MS4 secure randomness', () => {
  it('MS4: randomBytes uses getRandomValues, never getRandomBytes, for any size', () => {
    const fill = jest.fn((a: Uint8Array) => { a.set(require('crypto').randomBytes(a.length)); return a; });
    withExpoCrypto({ getRandomBytes: zeros, getRandomValues: fill });
    const { randomBytes } = require('../random') as typeof import('../random');
    const r = randomBytes(32);
    expect(r).toHaveLength(32);
    expect(r.some((b) => b !== 0)).toBe(true);
    expect(randomBytes(100_000)).toHaveLength(100_000); // past the 1024 cap of getRandomBytes and 65536 of WebCrypto
  });

  it('MS4: randomBytes fails loudly when no secure source exists', () => {
    withExpoCrypto({ getRandomBytes: zeros });
    const { randomBytes } = require('../random') as typeof import('../random');
    expect(() => randomBytes(32)).toThrow();
  });

  it('MS4: MLS signing keys never come from the dev fallback', async () => {
    const fill = (a: Uint8Array) => { a.set(require('crypto').randomBytes(a.length)); return a; };
    withExpoCrypto({ getRandomBytes: zeros, getRandomValues: fill });
    const { hearthCiphersuite } = require('../../messenger/mlsCrypto') as typeof import('../../messenger/mlsCrypto');
    const suite = await hearthCiphersuite();
    const { signKey } = await suite.signature.keygen();
    expect(Array.from(signKey).some((b) => b !== 0)).toBe(true);
    expect(Array.from(suite.rng.randomBytes(32)).some((b) => b !== 0)).toBe(true);
  });
});
