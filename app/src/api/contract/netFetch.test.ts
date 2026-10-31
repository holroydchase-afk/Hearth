// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// REAL-1: since SDK 58, jest-expo swaps the global fetch for Expo's native-only one, so the real-API
// contract run (scripts/contract-real.sh) got no answers at all. The harness must use Node's network fetch.
import { netFetch } from './supabaseHarness';

describe('real-API contract harness', () => {
  it('REAL-1 uses a network fetch that really answers, not the Expo stub', async () => {
    expect(netFetch).toBe((globalThis as { __hearthNodeFetch?: typeof fetch }).__hearthNodeFetch);
    const r = await netFetch('data:text/plain,hello');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('hello');
  });
});
