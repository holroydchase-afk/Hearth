// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// BETA-AUD-2 / B8: the share sheet preselects THIS user's last audience, never anyone else's.
// The key includes the user id so two people on one phone never inherit each other's choice.
import type { KV } from '../platform/kv';

const key = (userId: string) => `hearth.lastAudience.v1.${userId}`;

export async function loadLastAudience(kv: KV, userId: string, available: string[]): Promise<string[]> {
  try {
    const raw = await kv.getItem(key(userId));
    if (!raw) return [];
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids)) return [];
    const ok = new Set(available);
    return ids.filter((x): x is string => typeof x === 'string' && ok.has(x));
  } catch {
    return [];
  }
}

export async function saveLastAudience(kv: KV, userId: string, ids: string[]): Promise<void> {
  try {
    await kv.setItem(key(userId), JSON.stringify(ids));
  } catch {
    // Not worth bothering anyone about.
  }
}
