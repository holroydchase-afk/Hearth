// BETA-TIME-1..4: pure helpers behind Photos' "Added from earlier" card and the timeline.
// Months and years follow the phone's local time (Jest runs in UTC here).
import { FakeBackend, FIXTURE } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import {
  EARLIER_DAYS, earlierGroups, isFromEarlier, monthLabel, monthSpan, startOfNextMonth, startOfNextYear, timelineRows, TimelineStore,
} from '../timeline';

const post = (id: string, taken: string | null, published: string, author = 'Chase', photos = 1) => ({
  post_id: id, author_id: `u-${author}`, author_name: author, caption: null, published_at: published, taken_at: taken,
  media: Array.from({ length: photos }, (_, i) => ({ media_id: `${id}-${i}`, kind: 'photo' as const, width: 1, height: 1, duration_ms: null, status: 'ready' as const })),
  heart_count: 0, i_hearted: false, comment_count: 0, audience: null, seen_count: null, reach_count: null,
});

describe('BETA-TIME-1 "Added from earlier"', () => {
  it('BETA-TIME-1 a post taken more than 30 days before it was shared is from earlier; 30 days or less is not', () => {
    expect(EARLIER_DAYS).toBe(30);
    expect(isFromEarlier({ taken_at: '2024-07-04T12:00:00Z', published_at: '2026-10-17T12:00:00Z' })).toBe(true);
    expect(isFromEarlier({ taken_at: '2026-09-17T12:00:00Z', published_at: '2026-10-17T12:00:00Z' })).toBe(false);
    expect(isFromEarlier({ taken_at: '2026-09-17T11:59:00Z', published_at: '2026-10-17T12:00:00Z' })).toBe(true);
    expect(isFromEarlier({ taken_at: null, published_at: '2026-10-17T12:00:00Z' })).toBe(false);
    expect(isFromEarlier({ published_at: '2026-10-17T12:00:00Z' })).toBe(false);
  });

  it('BETA-TIME-1 one card per sender, counting ready photos, opening at the newest month taken', () => {
    const g = earlierGroups([
      post('a', '2024-07-04T12:00:00Z', '2026-10-17T08:00:00Z', 'Chase', 10),
      post('n', null, '2026-10-17T07:00:00Z', 'Chase', 2),
      post('b', '2024-06-20T12:00:00Z', '2026-10-17T08:01:00Z', 'Chase', 8),
      post('c', '2023-12-25T12:00:00Z', '2026-10-16T08:00:00Z', 'Alex', 1),
    ]);
    expect(g).toEqual([
      { authorId: 'u-Chase', authorName: 'Chase', photoCount: 18, postIds: ['a', 'b'], openAt: '2024-07-04T12:00:00Z', fromAt: '2024-06-20T12:00:00Z' },
      { authorId: 'u-Alex', authorName: 'Alex', photoCount: 1, postIds: ['c'], openAt: '2023-12-25T12:00:00Z', fromAt: '2023-12-25T12:00:00Z' },
    ]);
  });
});

describe('BETA-TIME-1 card words (grandparent-ux)', () => {
  it('BETA-TIME-1 the card names the months in full: "July 2024", "June to July 2024", "December 2023 to July 2024"', () => {
    expect(monthSpan('2024-07-01T12:00:00Z', '2024-07-30T12:00:00Z')).toBe('July 2024');
    expect(monthSpan('2024-06-20T12:00:00Z', '2024-07-04T12:00:00Z')).toBe('June to July 2024');
    expect(monthSpan('2023-12-25T12:00:00Z', '2024-07-04T12:00:00Z')).toBe('December 2023 to July 2024');
  });
});

describe('BETA-TIME-2 month headers and cursors', () => {
  it('BETA-TIME-2 month labels read "July 2024"', () => {
    expect(monthLabel('2024-07-04T12:00:00Z')).toBe('July 2024');
    expect(monthLabel('2023-12-25T12:00:00Z')).toBe('December 2023');
  });

  it('BETA-TIME-2 a header before each new month, in timeline order', () => {
    const rows = timelineRows([
      { ...post('a', '2024-07-06T12:00:00Z', '2026-10-17T08:00:00Z'), sort_at: '2024-07-06T12:00:00Z' },
      { ...post('b', '2024-07-04T12:00:00Z', '2026-10-17T08:00:00Z'), sort_at: '2024-07-04T12:00:00Z' },
      { ...post('c', '2023-12-25T12:00:00Z', '2026-10-17T08:00:00Z'), sort_at: '2023-12-25T12:00:00Z' },
    ]);
    expect(rows.map((r) => (r.type === 'month' ? r.label : r.post.post_id))).toEqual(['July 2024', 'a', 'b', 'December 2023', 'c']);
  });

  it('BETA-TIME-2/4 opening at a month or year starts just after it', () => {
    expect(startOfNextMonth('2024-07-04T12:00:00Z')).toBe(new Date(2024, 7, 1).toISOString());
    expect(startOfNextMonth('2024-12-25T12:00:00Z')).toBe(new Date(2025, 0, 1).toISOString());
    expect(startOfNextYear(2024)).toBe(new Date(2025, 0, 1).toISOString());
  });
});

describe('BETA-TIME-2/4 TimelineStore', () => {
  async function dated(be: FakeBackend, takenAt: string | null, photos = 1) {
    return (await seedPost(be, { takenAt, photos })).id;
  }

  it('BETA-TIME-2 loads newest taken first, pages with "Show older", and opens at a month', async () => {
    const be = FakeBackend.withFixture();
    const jul = await dated(be, '2024-07-04T12:00:00Z');
    const dec = await dated(be, '2023-12-25T12:00:00Z');
    const now = await dated(be, null);
    const s = new TimelineStore({ api: be.clientFor(FIXTURE.users.jo.id), space: FIXTURE.space.id, pageSize: 2, timeZone: 'UTC' });
    await s.open(null);
    expect(s.getState().posts.map((p) => p.post_id)).toEqual([now, jul]);
    expect(s.getState().hasMore).toBe(true);
    await s.loadMore();
    expect(s.getState().posts.map((p) => p.post_id)).toEqual([now, jul, dec]);
    await s.open(startOfNextMonth('2023-12-25T12:00:00Z'));
    expect(s.getState().posts.map((p) => p.post_id)).toEqual([dec]);
    expect(s.getState().startAt).toBe(startOfNextMonth('2023-12-25T12:00:00Z'));
  });

  it('BETA-TIME-4 years come from the server with photo counts', async () => {
    const be = FakeBackend.withFixture();
    await dated(be, '2024-07-04T12:00:00Z', 3);
    await dated(be, '2023-12-25T12:00:00Z', 2);
    const s = new TimelineStore({ api: be.clientFor(FIXTURE.users.jo.id), space: FIXTURE.space.id, timeZone: 'UTC' });
    await s.loadYears();
    expect(s.getState().years?.filter((y) => y.year < 2025)).toEqual([
      { year: 2024, post_count: 1, photo_count: 3 }, { year: 2023, post_count: 1, photo_count: 2 },
    ]);
  });

  it('BETA-TIME-3 a relative only ever gets the posts shared with her', async () => {
    const be = FakeBackend.withFixture();
    const mine = (await seedPost(be, { takenAt: '2024-07-04T12:00:00Z', circles: [FIXTURE.circles.dadSide.id] })).id;
    const other = (await seedPost(be, { takenAt: '2024-07-05T12:00:00Z', circles: [FIXTURE.circles.momSide.id] })).id;
    const s = new TimelineStore({ api: be.clientFor(FIXTURE.users.jo.id), space: FIXTURE.space.id, timeZone: 'UTC' });
    await s.open(null);
    const ids = s.getState().posts.map((p) => p.post_id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(other);
  });
});
