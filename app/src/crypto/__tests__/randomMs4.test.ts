// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// MS4 (privacy-security review, PR #29), ported into PR 25 so photo encryption on this branch never uses
// expo-crypto's getRandomBytes, which quietly falls back to Math.random in Expo Go on RN 0.86.
const zeros = (n: number) => new Uint8Array(n); // stands in for the predictable Math.random fallback

function withExpoCrypto(m: Record<string, unknown>) {
  jest.resetModules();
  jest.doMock('expo-crypto', () => ({ randomUUID: () => 'x', ...m }));
}
afterEach(() => jest.dontMock('expo-crypto'));

describe('MS4 secure randomness (photos)', () => {
  it('MS4: randomBytes uses getRandomValues, never getRandomBytes, for any size', () => {
    const fill = jest.fn((a: Uint8Array) => { a.set(require('crypto').randomBytes(a.length)); return a; });
    withExpoCrypto({ getRandomBytes: zeros, getRandomValues: fill });
    const { randomBytes } = require('../random') as typeof import('../random');
    const r = randomBytes(32);
    expect(r).toHaveLength(32);
    expect(r.some((b) => b !== 0)).toBe(true);
    expect(randomBytes(100_000)).toHaveLength(100_000);
  });

  it('MS4: randomBytes fails loudly when no secure source exists', () => {
    withExpoCrypto({ getRandomBytes: zeros });
    const { randomBytes } = require('../random') as typeof import('../random');
    expect(() => randomBytes(32)).toThrow();
  });
});
