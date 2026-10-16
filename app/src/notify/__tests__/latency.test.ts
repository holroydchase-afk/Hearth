// AE-10 / BETA-NOTIFY-1: the phone keeps its own record of when notices arrived.
// Nothing is sent anywhere; the report has delays only, no post ids or names.
import { memoryKV } from '../../platform/kv';
import { loadArrivals, recordArrival, timingReport } from '../latency';

const U = 'user-1';

describe('notice timing log (AE-10)', () => {
  it('AE-10: keeps the first arrival per post, and stays on the phone', async () => {
    const kv = memoryKV();
    await recordArrival(kv, U, 'p1', 2_000);
    await recordArrival(kv, U, 'p1', 9_000); // the same notice seen again (tap after delivery)
    await recordArrival(kv, U, 'p2', 5_000);
    expect(await loadArrivals(kv, U)).toEqual([{ post_id: 'p1', arrived_at: 2_000 }, { post_id: 'p2', arrived_at: 5_000 }]);
  });

  it('AE-10: keeps at most 200 arrivals (newest win)', async () => {
    const kv = memoryKV();
    for (let i = 0; i < 205; i++) await recordArrival(kv, U, `p${i}`, i);
    const a = await loadArrivals(kv, U);
    expect(a).toHaveLength(200);
    expect(a[0]!.post_id).toBe('p5');
  });

  it('BETA-NOTIFY-1: the report gives the 90th percentile delay against each post\'s publish time', () => {
    const t0 = Date.parse('2026-11-01T12:00:00Z');
    const arrivals = Array.from({ length: 10 }, (_, i) => ({ post_id: `p${i}`, arrived_at: t0 + (i + 1) * 10_000 }));
    const posts = Array.from({ length: 10 }, (_, i) => ({ post_id: `p${i}`, published_at: new Date(t0).toISOString() }));
    const r = timingReport(arrivals, posts);
    expect(r.count).toBe(10);
    expect(r.p90s).toBe(90);
    expect(r.text).toContain('Posts measured: 10');
    expect(r.text).toContain('90% arrived within: 90 seconds');
    expect(r.text).toContain('Meets the 60-second goal: no');
  });

  it('AE-10: notices for posts not on the phone are left out; the text has no ids', () => {
    const r = timingReport([{ post_id: 'secret-post-id', arrived_at: 5_000 }, { post_id: 'gone', arrived_at: 1 }],
      [{ post_id: 'secret-post-id', published_at: new Date(0).toISOString() }]);
    expect(r.count).toBe(1);
    expect(r.text).not.toContain('secret-post-id');
    expect(r.text).toContain('Meets the 60-second goal: not enough posts yet (need 10)');
  });
});
