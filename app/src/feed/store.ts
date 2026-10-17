// Feed cache: keyset pagination over get_feed, a per-user cached first page for instant opens,
// and optimistic hearts, comments and deletes. Framework-free; React reads it through useFeed().
import type { CommentRow, FeedPost, HearthApi } from '../api/HearthApi';
import { uuid as realUuid } from '../crypto/random';
import { messageFor } from '../errors/messages';
import type { KV } from '../platform/kv';

export interface CommentView extends CommentRow {
  status: 'sent' | 'sending' | 'failed';
  client_id?: string;
}

export interface FeedState {
  posts: FeedPost[];
  status: 'idle' | 'loading' | 'refreshing' | 'loadingMore';
  /** At least one answer (cache or network) has arrived. */
  loaded: boolean;
  hasMore: boolean;
  notice: string | null;
  comments: Record<string, CommentView[]>;
  drafts: Record<string, string>;
  /** BETA-TIME-2: posts opened from the timeline that aren't on a loaded feed page (hearts and replies still work). */
  opened: Record<string, FeedPost>;
}

export interface FeedStoreOptions {
  api: HearthApi;
  kv: KV;
  userId: string;
  spaceId: string;
  pageSize?: number;
  uuid?: () => string;
  inviter?: string | null;
}

const cacheKey = (user: string, space: string) => `hearth.feedCache.v1.${user}.${space}`;

export class FeedStore {
  private state: FeedState = { posts: [], status: 'idle', loaded: false, hasMore: false, notice: null, comments: {}, drafts: {}, opened: {} };
  private listeners = new Set<() => void>();
  private pendingHearts = new Map<string, { i_hearted: boolean; heart_count: number }>();
  private deleting = new Set<string>();
  private seen = new Set<string>();
  private readonly pageSize: number;
  private readonly newId: () => string;

  constructor(private o: FeedStoreOptions) {
    this.pageSize = o.pageSize ?? 20;
    this.newId = o.uuid ?? realUuid;
  }

  getState = (): FeedState => this.state;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<FeedState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }
  private notice(e: unknown, action?: 'comment' | 'other'): void {
    this.set({ notice: messageFor(e, { inviter: this.o.inviter, action }) });
  }
  clearNotice(): void {
    if (this.state.notice) this.set({ notice: null });
  }

  /** Server rows, with any in-flight optimistic changes laid on top. */
  private overlay(rows: FeedPost[]): FeedPost[] {
    return rows
      .filter((p) => !this.deleting.has(p.post_id))
      .map((p) => {
        const h = this.pendingHearts.get(p.post_id);
        return h ? { ...p, ...h } : p;
      });
  }

  async hydrate(): Promise<void> {
    try {
      const raw = await this.o.kv.getItem(cacheKey(this.o.userId, this.o.spaceId));
      if (!raw || this.state.loaded) return;
      const posts = JSON.parse(raw) as FeedPost[];
      if (Array.isArray(posts)) this.set({ posts: this.overlay(posts), loaded: true, hasMore: posts.length >= this.pageSize });
    } catch {
      // A bad cache is just an empty cache.
    }
  }

  async refresh(): Promise<void> {
    this.set({ status: this.state.loaded ? 'refreshing' : 'loading' });
    try {
      const rows = await this.o.api.getFeed({ space: this.o.spaceId, limit: this.pageSize });
      this.set({ posts: this.overlay(rows), loaded: true, hasMore: rows.length >= this.pageSize, status: 'idle' });
      void this.o.kv.setItem(cacheKey(this.o.userId, this.o.spaceId), JSON.stringify(rows)).catch(() => {});
    } catch (e) {
      this.set({ status: 'idle' });
      this.notice(e);
    }
  }

  async loadMore(): Promise<void> {
    const last = this.state.posts[this.state.posts.length - 1];
    if (!last || !this.state.hasMore || this.state.status !== 'idle') return;
    this.set({ status: 'loadingMore' });
    try {
      const rows = await this.o.api.getFeed({ space: this.o.spaceId, beforeTs: last.published_at, beforeId: last.post_id, limit: this.pageSize });
      const have = new Set(this.state.posts.map((p) => p.post_id));
      this.set({
        posts: [...this.state.posts, ...this.overlay(rows.filter((r) => !have.has(r.post_id)))],
        hasMore: rows.length >= this.pageSize,
        status: 'idle',
      });
    } catch (e) {
      this.set({ status: 'idle' });
      this.notice(e);
    }
  }

  private patchPost(id: string, patch: Partial<FeedPost>): void {
    const o = this.state.opened[id];
    this.set({
      posts: this.state.posts.map((p) => (p.post_id === id ? { ...p, ...patch } : p)),
      ...(o ? { opened: { ...this.state.opened, [id]: { ...o, ...patch } } } : {}),
    });
  }

  /** A post from the feed, or one opened from the timeline. */
  find(id: string): FeedPost | undefined {
    return this.state.posts.find((x) => x.post_id === id) ?? this.state.opened[id];
  }

  /** BETA-TIME-2: open a timeline post as a full post; it joins the store only if the feed hasn't loaded it. */
  adopt(post: FeedPost): void {
    if (this.find(post.post_id)) return;
    this.set({ opened: { ...this.state.opened, [post.post_id]: post } });
  }

  async toggleHeart(id: string): Promise<void> {
    const p = this.find(id);
    if (!p) return;
    const before = { i_hearted: p.i_hearted, heart_count: p.heart_count };
    const guess = { i_hearted: !p.i_hearted, heart_count: Math.max(0, p.heart_count + (p.i_hearted ? -1 : 1)) };
    this.pendingHearts.set(id, guess);
    this.patchPost(id, guess);
    try {
      const real = await this.o.api.toggleHeart(id);
      this.pendingHearts.delete(id);
      this.patchPost(id, { i_hearted: real.i_hearted, heart_count: real.heart_count });
    } catch (e) {
      this.pendingHearts.delete(id);
      this.patchPost(id, before);
      this.notice(e);
    }
  }

  async loadComments(id: string): Promise<void> {
    try {
      const rows = await this.o.api.getComments(id);
      const local = (this.state.comments[id] ?? []).filter((c) => c.status !== 'sent');
      this.set({ comments: { ...this.state.comments, [id]: [...rows.map((r) => ({ ...r, status: 'sent' as const })), ...local] } });
    } catch {
      // Comments are secondary; the photo still shows.
    }
  }

  setDraft(id: string, text: string): void {
    this.set({ drafts: { ...this.state.drafts, [id]: text } });
  }

  private putComment(id: string, clientId: string, patch: Partial<CommentView> | null): void {
    const list = this.state.comments[id] ?? [];
    const next = patch === null
      ? list.filter((c) => c.client_id !== clientId)
      : list.some((c) => c.client_id === clientId)
        ? list.map((c) => (c.client_id === clientId ? { ...c, ...patch } : c))
        : [...list, patch as CommentView];
    this.set({ comments: { ...this.state.comments, [id]: next } });
  }

  async addComment(id: string, body: string, me: { id: string; name: string }): Promise<void> {
    const text = body.trim();
    if (!text) {
      this.set({ notice: messageFor({ code: '23514' }, { action: 'comment' }) });
      return;
    }
    const clientId = this.newId();
    this.putComment(id, clientId, {
      comment_id: `local-${clientId}`, client_id: clientId, author_id: me.id, author_name: me.name,
      body: text, created_at: new Date().toISOString(), status: 'sending',
    });
    this.set({ drafts: { ...this.state.drafts, [id]: '' } });
    await this.send(id, clientId, text);
  }

  async retryComment(id: string, clientId: string): Promise<void> {
    const c = (this.state.comments[id] ?? []).find((x) => x.client_id === clientId);
    if (!c) return;
    this.putComment(id, clientId, { status: 'sending' });
    await this.send(id, clientId, c.body);
  }

  private async send(id: string, clientId: string, text: string): Promise<void> {
    try {
      const r = await this.o.api.addComment({ clientId, post: id, body: text });
      this.putComment(id, clientId, { comment_id: r.comment_id, created_at: r.created_at, status: 'sent' });
      const p = this.find(id);
      if (p) this.patchPost(id, { comment_count: p.comment_count + 1 });
    } catch (e) {
      this.putComment(id, clientId, { status: 'failed' });
      this.notice(e, 'comment');
    }
  }

  async deletePost(id: string): Promise<boolean> {
    const before = this.state.posts;
    this.deleting.add(id);
    this.set({ posts: before.filter((p) => p.post_id !== id) });
    try {
      await this.o.api.deletePost(id);
      return true;
    } catch (e) {
      this.deleting.delete(id);
      this.set({ posts: before });
      this.notice(e);
      return false;
    }
  }

  /** Record that this person looked at a post (feeds "Seen by"). Never for the author. */
  markSeen(p: FeedPost): void {
    if (p.author_id === this.o.userId || this.seen.has(p.post_id)) return;
    this.seen.add(p.post_id);
    this.o.api.markSeen(p.post_id).catch(() => this.seen.delete(p.post_id));
  }
}
