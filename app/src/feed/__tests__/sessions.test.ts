// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// SESS-1..2 (Chase, Oct 18 "Yes build both"): a 1-hour session in Photos, display only.
// Consecutive posts by one sender, to the same groups, each within 1 hour of the one before, on one local day,
// show as one entry with one swipe through all their photos. Written first: red until src/feed/sessions.ts exists.
import type { AudienceCircle, FeedPost } from '../../api/HearthApi';
import { photosRows } from '../events';
import { SESSION_GAP_MS, canJoinSession, sessionPhotos, withSessions } from '../sessions';

let n = 0;
/** Local time on Oct 24 2026 (so day boundaries are the phone's, whatever zone the test runs in). */
const at = (h: number, m = 0, day = 24) => new Date(2026, 9, day, h, m).toISOString();
const DAD: AudienceCircle = { circle_id: 'c-dad', name: "Dad's side", member_count: 4 };
const MOM: AudienceCircle = { circle_id: 'c-mom', name: "Mom's side", member_count: 3 };

function post(publishedAt: string, o: { author?: string; audience?: AudienceCircle[] | null; event?: string | null; photos?: number; pending?: number } = {}): FeedPost {
  n += 1;
  const ready = o.photos ?? 1;
  return {
    post_id: `p${n}`, author_id: o.author ?? 'chase', author_name: o.author === 'alex' ? 'Alex' : 'Chase', caption: `caption ${n}`,
    published_at: publishedAt,
    media: [
      ...Array.from({ length: ready }, (_, i) => ({ media_id: `m${n}-${i}`, kind: 'photo' as const, width: 4, height: 3, duration_ms: null, status: 'ready' as const })),
      ...Array.from({ length: o.pending ?? 0 }, (_, i) => ({ media_id: `m${n}-pending-${i}`, kind: 'photo' as const, width: 4, height: 3, duration_ms: null, status: 'pending' as const })),
    ],
    heart_count: 0, i_hearted: false, comment_count: 0,
    audience: o.audience === undefined ? null : o.audience, seen_count: null, reach_count: null,
    event_id: o.event ?? null, event_name: o.event ? 'Birthday' : null,
  };
}

/** Photos lists newest first. */
const rowsOf = (newestFirst: FeedPost[]) => withSessions(photosRows(newestFirst));

describe('SESS-1 one entry for a 1-hour session', () => {
  it('SESS-1 the gap is 1 hour', () => {
    expect(SESSION_GAP_MS).toBe(60 * 60 * 1000);
  });

  it('SESS-1 three posts by one sender to the same groups, each within an hour of the one before, are one entry', () => {
    const a = post(at(10, 0), { photos: 2 });
    const b = post(at(10, 50), { photos: 3 });
    const c = post(at(11, 45), { photos: 1 }); // 2 h after the first, but 55 min after the one before: still the run
    const rows = rowsOf([c, b, a]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'session', posts: [a, b, c] }); // posting order (oldest first)
  });

  it('SESS-1 the session swipes through every ready photo, in posting order, each knowing its own post and place', () => {
    const a = post(at(10, 0), { photos: 2, pending: 1 });
    const b = post(at(10, 30), { photos: 1 });
    const photos = sessionPhotos([a, b]);
    expect(photos.map((p) => [p.postId, p.index, p.media.media_id])).toEqual([
      [a.post_id, 0, a.media[0]!.media_id],
      [a.post_id, 1, a.media[1]!.media_id],
      [b.post_id, 0, b.media[0]!.media_id],
    ]);
  });

  it('SESS-1 for the sender, the same groups in another order still merge', () => {
    const a = post(at(9), { audience: [DAD, MOM] });
    const b = post(at(9, 20), { audience: [MOM, DAD] });
    expect(canJoinSession(a, b)).toBe(true);
    expect(rowsOf([b, a])).toHaveLength(1);
  });

  it('SESS-1 more than an hour after the one before starts a new entry; a lone post stays an ordinary post', () => {
    const a = post(at(8, 0));
    const b = post(at(8, 30));
    const c = post(at(9, 31)); // 61 min after b
    const rows = rowsOf([c, b, a]);
    expect(rows.map((r) => r.type)).toEqual(['post', 'session']);
    expect(rows[0]).toMatchObject({ type: 'post', post: c });
  });

  it('SESS-1 exactly one hour still merges', () => {
    expect(canJoinSession(post(at(14, 0)), post(at(15, 0)))).toBe(true);
  });

  it('SESS-1 a post with no ready photo yet stays on its own (nothing to swipe)', () => {
    const a = post(at(10, 0));
    const b = post(at(10, 10), { photos: 0, pending: 2 });
    const c = post(at(10, 20));
    expect(rowsOf([c, b, a]).map((r) => r.type)).toEqual(['post', 'post', 'post']);
  });
});

describe('SESS-2 what never merges', () => {
  it('SESS-2 different senders never merge', () => {
    const a = post(at(10, 0));
    const b = post(at(10, 5), { author: 'alex' });
    expect(canJoinSession(a, b)).toBe(false);
    expect(rowsOf([b, a]).map((r) => r.type)).toEqual(['post', 'post']);
  });

  it('SESS-2 different groups never merge', () => {
    const a = post(at(10, 0), { audience: [DAD] });
    const b = post(at(10, 5), { audience: [DAD, MOM] });
    expect(canJoinSession(a, b)).toBe(false);
    expect(rowsOf([b, a]).map((r) => r.type)).toEqual(['post', 'post']);
  });

  it('SESS-2 an event post and a non-event post never merge; nor do two events', () => {
    expect(canJoinSession(post(at(10, 0)), post(at(10, 5), { event: 'e1' }))).toBe(false);
    expect(canJoinSession(post(at(10, 0), { event: 'e1' }), post(at(10, 5), { event: 'e2' }))).toBe(false);
  });

  it('SESS-2 an event card (first post of an event) is never part of a session', () => {
    const first = post(at(10, 0), { event: 'e1' });
    const later = post(at(10, 5), { event: 'e1' });
    const rows = rowsOf([later, first]);
    expect(rows.map((r) => r.type)).toEqual(['post', 'event']);
  });

  it('SESS-2 never across midnight (local time), even 20 minutes apart', () => {
    const a = post(at(23, 50, 24));
    const b = post(at(0, 10, 25));
    expect(canJoinSession(a, b)).toBe(false);
    expect(rowsOf([b, a]).map((r) => r.type)).toEqual(['post', 'post']);
  });

  it('SESS-2 a different post in between breaks the run', () => {
    const a = post(at(10, 0));
    const x = post(at(10, 5), { author: 'alex' });
    const b = post(at(10, 10));
    expect(rowsOf([b, x, a]).map((r) => r.type)).toEqual(['post', 'post', 'post']);
  });
});
