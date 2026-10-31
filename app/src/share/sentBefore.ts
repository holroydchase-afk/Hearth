// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// R15 HELP-DUP-2: what this person sent from this phone in the last 30 days, as preview fingerprints
// (SHA-256 of the 160 px preview, never the photo). Kept on the phone only; never sent (HELP-R2).
import type { KV } from '../platform/kv';

export const SENT_KEEP_DAYS = 30;
const MAX = 2000;
const DAY = 86_400_000;
const key = (userId: string) => `hearth.sentBefore.v1.${userId}`;

type Entry = [id: string, at: number];

async function read(kv: KV, userId: string): Promise<Entry[]> {
  try {
    const v = JSON.parse((await kv.getItem(key(userId))) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((e): e is Entry => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number') : [];
  } catch {
    return [];
  }
}

export async function loadSent(kv: KV, userId: string, now = Date.now()): Promise<Set<string>> {
  return new Set((await read(kv, userId)).filter(([, at]) => now - at <= SENT_KEEP_DAYS * DAY).map(([id]) => id));
}

export async function recordSent(kv: KV, userId: string, ids: string[], now = Date.now()): Promise<void> {
  if (!ids.length) return;
  const kept = (await read(kv, userId)).filter(([id, at]) => now - at <= SENT_KEEP_DAYS * DAY && !ids.includes(id));
  const next = [...kept, ...ids.map((id): Entry => [id, now])].slice(-MAX);
  await kv.setItem(key(userId), JSON.stringify(next));
}
