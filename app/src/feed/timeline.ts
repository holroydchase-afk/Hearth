// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// BETA-TIME-1..4: Photos' "Older photos" card and the "by date" timeline.
// Months and years are the phone's local time, with plain Date math (no Intl dependency,
// like ui/format.ts). The server decides what the caller may see (get_timeline uses the same
// visibility function as get_feed); nothing here filters for privacy.
import type { FeedPost, HearthApi, TimelinePost, TimelineYear } from '../api/HearthApi';
import { messageFor } from '../errors/messages';
import { phoneTimeZone } from '../media/captureDate';

export const EARLIER_DAYS = 30;
const DAY_MS = 86_400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Taken more than 30 days before it was shared (a bulk import of old photos). */
export function isFromEarlier(p: { taken_at?: string | null; published_at: string }): boolean {
  if (!p.taken_at) return false;
  const taken = new Date(p.taken_at).getTime();
  const shared = new Date(p.published_at).getTime();
  return Number.isFinite(taken) && Number.isFinite(shared) && shared - taken > EARLIER_DAYS * DAY_MS;
}

export interface EarlierGroup {
  authorId: string;
  authorName: string;
  photoCount: number;
  postIds: string[];
  /** The newest date taken among them: the card opens the timeline at this month. */
  openAt: string;
  /** The oldest date taken among them, for "from December 2023 to July 2024". */
  fromAt: string;
}

/** One "Older photos" card per sender, in the order they appear in Photos. */
export function earlierGroups(posts: FeedPost[]): EarlierGroup[] {
  const out = new Map<string, EarlierGroup>();
  for (const p of posts) {
    if (!isFromEarlier(p)) continue;
    const g = out.get(p.author_id) ?? { authorId: p.author_id, authorName: p.author_name, photoCount: 0, postIds: [], openAt: p.taken_at!, fromAt: p.taken_at! };
    g.photoCount += p.media.filter((m) => m.status === 'ready').length;
    g.postIds.push(p.post_id);
    if (p.taken_at! > g.openAt) g.openAt = p.taken_at!;
    if (p.taken_at! < g.fromAt) g.fromAt = p.taken_at!;
    out.set(p.author_id, g);
  }
  return [...out.values()];
}

/** "July 2024" */
export function monthLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "July 2024", "June to July 2024", "December 2023 to July 2024" (full month names). */
export function monthSpan(fromIso: string, toIso: string): string {
  const a = new Date(fromIso), b = new Date(toIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return monthLabel(toIso);
  if (a.getFullYear() === b.getFullYear()) return `${MONTHS[a.getMonth()]} to ${monthLabel(toIso)}`;
  return `${monthLabel(fromIso)} to ${monthLabel(toIso)}`;
}

/** The first moment of the month after this one: opening there shows this month first. */
export function startOfNextMonth(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
}

export function startOfNextYear(year: number): string {
  return new Date(year + 1, 0, 1).toISOString();
}

export type TimelineRow = { type: 'month'; key: string; label: string } | { type: 'post'; key: string; post: TimelinePost };

/** Posts in timeline order with a header before each new month. */
export function timelineRows(posts: TimelinePost[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let last = '';
  for (const p of posts) {
    const label = monthLabel(p.sort_at);
    if (label !== last) {
      rows.push({ type: 'month', key: `m-${label}-${p.post_id}`, label });
      last = label;
    }
    rows.push({ type: 'post', key: p.post_id, post: p });
  }
  return rows;
}

export interface TimelineState {
  posts: TimelinePost[];
  /** null = newest first; else the cursor the timeline opened at. */
  startAt: string | null;
  status: 'idle' | 'loading' | 'loadingMore';
  loaded: boolean;
  hasMore: boolean;
  years: TimelineYear[] | null;
  notice: string | null;
}

export interface TimelineStoreOptions {
  api: HearthApi;
  space: string;
  pageSize?: number;
  /** The phone's IANA zone, for the years list. */
  timeZone?: string;
  inviter?: string | null;
}

export class TimelineStore {
  private state: TimelineState = { posts: [], startAt: null, status: 'idle', loaded: false, hasMore: false, years: null, notice: null };
  private listeners = new Set<() => void>();
  private gen = 0;
  private readonly pageSize: number;

  constructor(private o: TimelineStoreOptions) {
    this.pageSize = o.pageSize ?? 20;
  }

  getState = (): TimelineState => this.state;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(patch: Partial<TimelineState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }
  clearNotice(): void {
    if (this.state.notice) this.set({ notice: null });
  }

  /** Start over at a cursor (null = newest taken first). */
  async open(startAt: string | null): Promise<void> {
    const gen = ++this.gen;
    this.set({ posts: [], startAt, status: 'loading', loaded: false, hasMore: false, notice: null });
    try {
      const page = await this.o.api.getTimeline({ space: this.o.space, beforeAt: startAt, beforeId: null, limit: this.pageSize });
      if (gen !== this.gen) return;
      this.set({ posts: page, status: 'idle', loaded: true, hasMore: page.length === this.pageSize });
    } catch (e) {
      if (gen !== this.gen) return;
      this.set({ status: 'idle', loaded: true, notice: messageFor(e, { inviter: this.o.inviter ?? null }) });
    }
  }

  async loadMore(): Promise<void> {
    const s = this.state;
    if (s.status !== 'idle' || !s.hasMore || s.posts.length === 0) return;
    const gen = this.gen;
    const last = s.posts[s.posts.length - 1]!;
    this.set({ status: 'loadingMore' });
    try {
      const page = await this.o.api.getTimeline({ space: this.o.space, beforeAt: last.sort_at, beforeId: last.post_id, limit: this.pageSize });
      if (gen !== this.gen) return;
      const seen = new Set(this.state.posts.map((p) => p.post_id));
      this.set({ posts: [...this.state.posts, ...page.filter((p) => !seen.has(p.post_id))], status: 'idle', hasMore: page.length === this.pageSize });
    } catch (e) {
      if (gen !== this.gen) return;
      this.set({ status: 'idle', notice: messageFor(e, { inviter: this.o.inviter ?? null }) });
    }
  }

  async loadYears(): Promise<void> {
    try {
      const years = await this.o.api.getTimelineYears(this.o.space, this.o.timeZone ?? phoneTimeZone());
      this.set({ years });
    } catch (e) {
      this.set({ years: [], notice: messageFor(e, { inviter: this.o.inviter ?? null }) });
    }
  }
}
