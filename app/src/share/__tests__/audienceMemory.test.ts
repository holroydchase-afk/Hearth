// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import { memoryKV } from '../../platform/kv';
import { loadLastAudience, saveLastAudience } from '../audienceMemory';

describe('BETA-AUD-2 / B8 audience default is per user', () => {
  it('remembers the last choice for the same user', async () => {
    const kv = memoryKV();
    await saveLastAudience(kv, 'chase', ['c-dad']);
    expect(await loadLastAudience(kv, 'chase', ['c-dad', 'c-mom'])).toEqual(['c-dad']);
  });

  it("never gives one user another user's choice on a shared phone", async () => {
    const kv = memoryKV();
    await saveLastAudience(kv, 'chase', ['c-dad']);
    expect(await loadLastAudience(kv, 'alex', ['c-dad', 'c-mom'])).toEqual([]);
  });

  it('drops groups that no longer exist (or the user no longer manages)', async () => {
    const kv = memoryKV();
    await saveLastAudience(kv, 'chase', ['c-dad', 'c-gone']);
    expect(await loadLastAudience(kv, 'chase', ['c-dad'])).toEqual(['c-dad']);
  });

  it('is empty (so Post stays disabled) when nothing was saved or storage is broken', async () => {
    expect(await loadLastAudience(memoryKV(), 'chase', ['c-dad'])).toEqual([]);
    const broken = { getItem: async () => '{not json', setItem: async () => {}, removeItem: async () => {} };
    expect(await loadLastAudience(broken, 'chase', ['c-dad'])).toEqual([]);
  });
});
