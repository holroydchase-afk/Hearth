// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// SPEC-GROUPS v2, EVT-2..4 (app-now): how event posts sit in Photos and the Events list.
// Written first (Oct 18): red until src/feed/events.ts exists.
import type { FeedPost } from '../../api/HearthApi';
import { EVENT_LATER_POSTS_IN_PHOTOS, eventList, eventPosts, photosRows, updateWords } from '../events';

let n = 0;
function post(at: string, ev: { id: string; name: string } | null = null, photoCount = 1): FeedPost {
  n += 1;
  return {
    post_id: `p${n}`, author_id: 'chase', author_name: 'Chase', caption: null, published_at: at,
    media: Array.from({ length: photoCount }, (_, i) => ({ media_id: `m${n}-${i}`, kind: 'photo' as const, width: 4, height: 3, duration_ms: null, status: 'ready' as const })),
    heart_count: 0, i_hearted: false, comment_count: 0, audience: null, seen_count: null, reach_count: null,
    event_id: ev?.id ?? null, event_name: ev?.name ?? null,
  };
}
const BDAY = { id: 'e-bday', name: "Chase's birthday" };
const BEACH = { id: 'e-beach', name: 'Beach week' };

describe('EVT-2 / EVT-3 Photos rows', () => {
  it('EVT-3 Chase (Oct 18): later event posts also show in Photos, like relatives adding photos a few days later', () => {
    expect(EVENT_LATER_POSTS_IN_PHOTOS).toBe(true);
  });

  it('EVT-2 the first post of an event is an event card with the event name, where that post falls in Photos', () => {
    const plain = post('2026-10-10T12:00:00Z');
    const first = post('2026-10-09T12:00:00Z', BDAY);
    const older = post('2026-10-08T12:00:00Z');
    const rows = photosRows([plain, first, older]);
    expect(rows.map((r) => r.type)).toEqual(['post', 'event', 'post']);
    expect(rows[1]).toMatchObject({ type: 'event', eventId: BDAY.id, eventName: BDAY.name, post: first });
  });

  it('EVT-3 (switch off) later posts to the same event become one update line (photo count, event name) at the newest one, not cards', () => {
    const later2 = post('2026-10-12T12:00:00Z', BDAY, 2);
    const plain = post('2026-10-11T12:00:00Z');
    const later1 = post('2026-10-10T12:00:00Z', BDAY, 1);
    const first = post('2026-10-09T12:00:00Z', BDAY, 4);
    const rows = photosRows([later2, plain, later1, first], false);
    expect(rows.map((r) => r.type)).toEqual(['update', 'post', 'event']);
    expect(rows[0]).toMatchObject({ type: 'update', eventId: BDAY.id, eventName: BDAY.name, photoCount: 3 });
    expect(rows.some((r) => r.type === 'post' && (r.post === later1 || r.post === later2))).toBe(false);
  });

  it('EVT-3 (switch off) two events each get their own card and update line', () => {
    const b2 = post('2026-10-12T12:00:00Z', BEACH);
    const a2 = post('2026-10-11T12:00:00Z', BDAY);
    const b1 = post('2026-10-10T12:00:00Z', BEACH);
    const a1 = post('2026-10-09T12:00:00Z', BDAY);
    const rows = photosRows([b2, a2, b1, a1], false);
    expect(rows.map((r) => `${r.type}:${'eventId' in r ? r.eventId : ''}`)).toEqual([
      'update:e-beach', 'update:e-bday', 'event:e-beach', 'event:e-bday',
    ]);
  });

  it('EVT-3 Chase\'s choice: later posts are ordinary cards and there is no update line', () => {
    const later = post('2026-10-10T12:00:00Z', BDAY);
    const first = post('2026-10-09T12:00:00Z', BDAY);
    const rows = photosRows([later, first], true);
    expect(rows.map((r) => r.type)).toEqual(['post', 'event']);
    expect(rows[0]).toMatchObject({ type: 'post', post: later });
  });

  it('EVT-3 the update line words: "3 new photos in Chase\'s birthday", "1 new photo in ..."', () => {
    expect(updateWords(3, "Chase's birthday")).toBe("3 new photos in Chase's birthday");
    expect(updateWords(1, 'Beach week')).toBe('1 new photo in Beach week');
  });

  it('EVT-2 a post with no event (or a relative not in it: the server sends nulls) is an ordinary card', () => {
    const p = post('2026-10-09T12:00:00Z');
    expect(photosRows([p])).toEqual([{ type: 'post', key: p.post_id, post: p }]);
  });
});

describe('EVT-4 Events list', () => {
  it('EVT-4 lists each event once, newest first (by when it started), with its photo count; each opens its posts', () => {
    const b2 = post('2026-10-12T12:00:00Z', BDAY, 2);
    const plain = post('2026-10-11T12:00:00Z');
    const a1 = post('2026-10-10T12:00:00Z', BEACH, 3);
    const b1 = post('2026-10-01T12:00:00Z', BDAY, 1);
    const all = [b2, plain, a1, b1];
    expect(eventList(all)).toEqual([
      { eventId: BEACH.id, eventName: BEACH.name, photoCount: 3, startedAt: a1.published_at },
      { eventId: BDAY.id, eventName: BDAY.name, photoCount: 3, startedAt: b1.published_at },
    ]);
    expect(eventPosts(all, BDAY.id)).toEqual([b2, b1]);
    expect(eventPosts(all, 'nope')).toEqual([]);
  });

  it('EVT-4 no events: an empty list', () => {
    expect(eventList([post('2026-10-11T12:00:00Z')])).toEqual([]);
  });
});
