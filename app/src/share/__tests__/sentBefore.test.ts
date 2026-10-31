// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// R15 HELP-DUP-2: photos this person already sent in the last 30 days, kept on the phone only.
import { memoryKV } from '../../platform/kv';
import { SENT_KEEP_DAYS, loadSent, recordSent } from '../sentBefore';

const DAY = 86_400_000;

describe('R15 HELP-DUP-2 sent-before memory', () => {
  it('HELP-DUP-2 remembers what was sent for 30 days, then forgets it', async () => {
    const kv = memoryKV();
    const t0 = Date.UTC(2026, 9, 1);
    await recordSent(kv, 'u1', ['aa', 'bb'], t0);
    expect([...(await loadSent(kv, 'u1', t0 + 29 * DAY))].sort()).toEqual(['aa', 'bb']);
    expect((await loadSent(kv, 'u1', t0 + (SENT_KEEP_DAYS + 1) * DAY)).size).toBe(0);
  });

  it('HELP-DUP-2 is per person on this phone, and stays bounded', async () => {
    const kv = memoryKV();
    await recordSent(kv, 'u1', Array.from({ length: 2500 }, (_, i) => `h${i}`), 1);
    expect((await loadSent(kv, 'u1', 2)).size).toBe(2000);
    expect((await loadSent(kv, 'u2', 2)).size).toBe(0);
  });

  it('HELP-DUP-2 unreadable storage counts as nothing sent', async () => {
    const kv = memoryKV();
    await kv.setItem('hearth.sentBefore.v1.u1', '{not json');
    expect((await loadSent(kv, 'u1', 1)).size).toBe(0);
  });
});
