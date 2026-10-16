// AE-10 / BETA-NOTIFY-1: when did each notice reach this phone? Kept on the phone only
// (never sent anywhere). The report Chase copies has delays in seconds, no post ids.
import type { KV } from '../platform/kv';

export interface Arrival { post_id: string; arrived_at: number }
const MAX = 200;
const key = (u: string) => `hearth.latency.v1.${u}`;

export async function loadArrivals(kv: KV, userId: string): Promise<Arrival[]> {
  try {
    const raw = await kv.getItem(key(userId));
    const a = raw ? (JSON.parse(raw) as Arrival[]) : [];
    return Array.isArray(a) ? a.filter((x) => typeof x?.post_id === 'string' && typeof x?.arrived_at === 'number') : [];
  } catch {
    return [];
  }
}

/** Keeps the first arrival per post (a later tap on the same notice doesn't count). */
export async function recordArrival(kv: KV, userId: string, postId: string, arrivedAt: number): Promise<void> {
  const a = await loadArrivals(kv, userId);
  if (a.some((x) => x.post_id === postId)) return;
  a.push({ post_id: postId, arrived_at: arrivedAt });
  try { await kv.setItem(key(userId), JSON.stringify(a.slice(-MAX))); } catch { /* best effort */ }
}

export interface TimingReport { count: number; p50s: number | null; p90s: number | null; text: string }

export function timingReport(arrivals: Arrival[], posts: { post_id: string; published_at: string }[]): TimingReport {
  const published = new Map(posts.map((p) => [p.post_id, Date.parse(p.published_at)]));
  const delays = arrivals
    .filter((a) => published.has(a.post_id))
    .map((a) => Math.max(0, Math.round((a.arrived_at - published.get(a.post_id)!) / 1000)))
    .sort((x, y) => x - y);
  const pct = (q: number) => (delays.length ? delays[Math.ceil(q * delays.length) - 1]! : null);
  const p50s = pct(0.5);
  const p90s = pct(0.9);
  const goal = delays.length < 10 ? 'not enough posts yet (need 10)' : p90s! <= 60 ? 'yes' : 'no';
  const text = [
    'Hearth notice timing',
    `Posts measured: ${delays.length}`,
    `Half arrived within: ${p50s ?? '-'} seconds`,
    `90% arrived within: ${p90s ?? '-'} seconds`,
    `Meets the 60-second goal: ${goal}`,
    `Each delay (seconds): ${delays.join(', ') || '-'}`,
  ].join('\n');
  return { count: delays.length, p50s, p90s, text };
}
