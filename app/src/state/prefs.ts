// Per-user, on-this-phone choices. Viewers start with Bigger text ON (UX-REVIEW #3, #15).
import type { Role } from '../api/HearthApi';
import type { KV } from '../platform/kv';

export type NotifyChoice = 'push' | 'evening' | 'sunday';
export interface Prefs { bigText: boolean; notify: NotifyChoice }

const key = (u: string) => `hearth.prefs.v1.${u}`;

export function defaultPrefs(role: Role): Prefs {
  return { bigText: role === 'viewer', notify: 'push' };
}

export async function loadPrefs(kv: KV, userId: string, role: Role): Promise<Prefs> {
  const d = defaultPrefs(role);
  try {
    const raw = await kv.getItem(key(userId));
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      bigText: typeof p.bigText === 'boolean' ? p.bigText : d.bigText,
      notify: p.notify === 'evening' || p.notify === 'sunday' || p.notify === 'push' ? p.notify : d.notify,
    };
  } catch {
    return d;
  }
}

export async function savePrefs(kv: KV, userId: string, p: Prefs): Promise<void> {
  try { await kv.setItem(key(userId), JSON.stringify(p)); } catch { /* ignore */ }
}
