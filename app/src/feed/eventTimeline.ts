// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// EVT-6..9: inside an event, every member's photos as one timeline by when they were taken. Oldest first (an event
// reads like a story), a header per local day, 1-hour moments, an optional filter to one person, and photos with no
// capture time last under "Added later" (by when they were shared). Computed on the phone from the event's posts this
// person can already see; taken_at is per post (get_feed, 0010), so every photo in a post shares its post's time.
// Plain Date math like ui/format.ts (no Intl dependency for old Android builds).
import type { FeedMedia, FeedPost } from '../api/HearthApi';
import { andList, photos } from '../ui/format';

export const MOMENT_GAP_MS = 60 * 60 * 1000;
export const ADDED_LATER = 'Added later';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Saturday, Oct 24" in the phone's local time. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "3:10 pm" in the phone's local time. */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "3:10 pm · 14 photos from Mom, Rachel and Sue"; no time for "Added later". */
export function momentLine(at: string | null, count: number, names: string[]): string {
  const what = `${photos(count)} from ${andList(names)}`;
  return at ? `${timeLabel(at)} · ${what}` : what;
}

export interface EventPhoto {
  key: string;
  postId: string;
  /** Its place in its own post (the viewer opens the post there). */
  index: number;
  media: FeedMedia;
  authorId: string;
  /** "From Rachel" */
  from: string;
  takenAt: string | null;
  publishedAt: string;
}

export type EventTimelineRow =
  | { type: 'day'; key: string; label: string }
  | { type: 'later'; key: string; label: string }
  | { type: 'moment'; key: string; at: string | null; line: string; photos: EventPhoto[] };

const ms = (iso: string | null | undefined) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function photosOf(posts: FeedPost[]): EventPhoto[] {
  return posts.flatMap((p) =>
    p.media.filter((m) => m.status === 'ready').map((media, index) => ({
      key: media.media_id, postId: p.post_id, index, media, authorId: p.author_id, from: p.author_name,
      takenAt: ms(p.taken_at) === null ? null : p.taken_at!, publishedAt: p.published_at,
    })),
  );
}

const byThen = (a: number, b: number) => a - b;
const cmp = (x: EventPhoto, y: EventPhoto, at: (p: EventPhoto) => number) =>
  byThen(at(x), at(y)) || byThen(ms(x.publishedAt) ?? 0, ms(y.publishedAt) ?? 0)
  || (x.postId < y.postId ? -1 : x.postId > y.postId ? 1 : 0) || x.index - y.index;

function moment(list: EventPhoto[], at: string | null): EventTimelineRow {
  const names: string[] = [];
  for (const p of list) if (!names.includes(p.from)) names.push(p.from);
  return { type: 'moment', key: `moment-${list[0]!.key}`, at, line: momentLine(at, list.length, names), photos: list };
}

/** The people with a photo in the event, by name. */
export function eventContributors(posts: FeedPost[]): { authorId: string; name: string }[] {
  const out = new Map<string, string>();
  for (const p of photosOf(posts)) if (!out.has(p.authorId)) out.set(p.authorId, p.from);
  return [...out.entries()].map(([authorId, name]) => ({ authorId, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The event's rows: day headers and moments oldest first, then "Added later". person = one author's photos only. */
export function eventTimeline(posts: FeedPost[], opts: { person?: string | null } = {}): EventTimelineRow[] {
  const all = photosOf(posts).filter((p) => !opts.person || p.authorId === opts.person);
  const dated = all.filter((p) => p.takenAt).sort((x, y) => cmp(x, y, (p) => ms(p.takenAt)!));
  const undated = all.filter((p) => !p.takenAt).sort((x, y) => cmp(x, y, (p) => ms(p.publishedAt) ?? 0));

  const rows: EventTimelineRow[] = [];
  let day = '';
  let cur: EventPhoto[] = [];
  const flush = () => {
    if (cur.length) rows.push(moment(cur, cur[0]!.takenAt));
    cur = [];
  };
  for (const p of dated) {
    const d = localDay(p.takenAt!);
    if (d !== day) {
      flush();
      day = d;
      rows.push({ type: 'day', key: `day-${d}`, label: dayLabel(p.takenAt!) });
    }
    const prev = cur[cur.length - 1];
    if (prev && ms(p.takenAt)! - ms(prev.takenAt)! > MOMENT_GAP_MS) flush();
    cur.push(p);
  }
  flush();
  if (undated.length) {
    rows.push({ type: 'later', key: 'later', label: ADDED_LATER });
    rows.push(moment(undated, null));
  }
  return rows;
}
