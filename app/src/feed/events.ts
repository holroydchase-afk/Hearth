// SPEC-GROUPS v2, EVT-2..4: how event posts sit in Photos, and the Events list.
// The server decides who learns an event exists (EVT-1: event_id/event_name are null for anyone not in it),
// so nothing here filters for privacy. Works on the feed pages loaded so far.
import type { FeedPost } from '../api/HearthApi';
import { photos } from '../ui/format';

/**
 * EVT-3, open for Chase. false (the recommendation): an event's later posts live only inside the event, and Photos
 * shows one update line ("3 new photos in Chase's birthday") that opens it. true: they also show as ordinary cards
 * in Photos, and there is no update line. The first post is always the event card (EVT-2).
 */
export const EVENT_LATER_POSTS_IN_PHOTOS = false;

export type PhotosRow =
  | { type: 'post'; key: string; post: FeedPost }
  | { type: 'event'; key: string; eventId: string; eventName: string; post: FeedPost }
  | { type: 'update'; key: string; eventId: string; eventName: string; photoCount: number };

export interface EventSummary {
  eventId: string;
  eventName: string;
  photoCount: number;
  /** When its first post was shared: the list is newest first by this, so it doesn't reshuffle as photos arrive. */
  startedAt: string;
}

const readyCount = (p: FeedPost) => p.media.filter((m) => m.status === 'ready').length;

/** "3 new photos in Chase's birthday" */
export const updateWords = (count: number, eventName: string) => `${count} new ${count === 1 ? 'photo' : 'photos'} in ${eventName}`;

/** Photos' rows, newest first (posts arrive newest first). */
export function photosRows(posts: FeedPost[], laterInPhotos: boolean = EVENT_LATER_POSTS_IN_PHOTOS): PhotosRow[] {
  // The first (oldest loaded) post of each event.
  const firstOf = new Map<string, string>();
  for (const p of posts) if (p.event_id) firstOf.set(p.event_id, p.post_id);
  const later = new Map<string, number>();
  for (const p of posts) if (p.event_id && firstOf.get(p.event_id) !== p.post_id) later.set(p.event_id, (later.get(p.event_id) ?? 0) + readyCount(p));

  const rows: PhotosRow[] = [];
  const updated = new Set<string>();
  for (const p of posts) {
    const ev = p.event_id;
    if (!ev) rows.push({ type: 'post', key: p.post_id, post: p });
    else if (firstOf.get(ev) === p.post_id) rows.push({ type: 'event', key: p.post_id, eventId: ev, eventName: p.event_name ?? '', post: p });
    else if (laterInPhotos) rows.push({ type: 'post', key: p.post_id, post: p });
    else if (!updated.has(ev)) {
      updated.add(ev);
      rows.push({ type: 'update', key: `update-${ev}`, eventId: ev, eventName: p.event_name ?? '', photoCount: later.get(ev) ?? 0 });
    }
  }
  return rows;
}

/** EVT-4: the events this person is in (as far as the loaded posts show), newest first. */
export function eventList(posts: FeedPost[]): EventSummary[] {
  const out = new Map<string, EventSummary>();
  for (const p of posts) {
    if (!p.event_id) continue;
    const e = out.get(p.event_id) ?? { eventId: p.event_id, eventName: p.event_name ?? '', photoCount: 0, startedAt: p.published_at };
    e.photoCount += readyCount(p);
    if (p.published_at < e.startedAt) e.startedAt = p.published_at;
    out.set(p.event_id, e);
  }
  return [...out.values()].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

/** EVT-4: one event's posts, newest first. */
export const eventPosts = (posts: FeedPost[], eventId: string): FeedPost[] => posts.filter((p) => p.event_id === eventId);

/** "4 photos" under an event's name in the list. */
export const eventCountWords = (e: EventSummary) => photos(e.photoCount);
