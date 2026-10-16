// In-memory Hearth backend for tests, the web smoke test and offline demos.
// It enforces the same rules API.md promises: visibility via can_view_post, idempotency on
// p_client_id, author-only fields, the error codes, invite rules and the S10 rate limit.
// It is NOT a security boundary; it exists so the app can be built and tested against the
// contract before the real stack is reachable. The contract tests keep the two honest.
import { ApiError, type HearthApi } from '../HearthApi';
import type {
  ClientErrorReport,
  MyProfile,
  NotificationPrefs,
  PushPlatform,
  AddCommentArgs, Circle, CommentRow, CreateInviteArgs, CreatePostArgs, FeedArgs, FeedPost, FinalizeResult,
  HeartState, InvitePreview, MediaKind, MediaStatus, Role, Session, Space, UploadGrant, UploadItemSpec, ViewGrant,
} from '../types';
import { fromBase64, toBase64 } from '../../crypto/base64';
import { randomBytes, uuid } from '../../crypto/random';

export const FAKE_OTP = '123456';
const TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_FAILURES = 10;
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

interface UserRow { id: string; email: string; name: string; nameSet?: boolean } // nameSet undefined = set
interface MemberRow { space: string; user: string; role: Role; invited_by: string | null }
interface CircleRow { id: string; space: string; name: string; created_by: string; deleted: boolean }
interface PostRow {
  id: string; space: string; author: string; caption: string | null; status: 'draft' | 'published';
  deleted: boolean; circles: string[]; client_id: string; created_at: string; published_at: string | null;
}
interface MediaRow {
  id: string; post: string; position: number; kind: MediaKind; mime: string; width: number; height: number;
  duration_ms: number | null; byte_size: number; thumb_byte_size: number; status: MediaStatus; dek: string;
  display_key: string; thumb_key: string; uploader: string;
}
interface CommentRec { id: string; post: string; author: string; body: string; created_at: string; client_id: string }
interface InviteRow {
  code: string; space: string; role: Role; circles: string[]; created_by: string; target_email: string | null;
  expires_at: string; max_uses: number; uses: number; revoked: boolean; name?: string | null;
}

export interface FakeState {
  users: Record<string, UserRow>;
  spaces: Record<string, { id: string; name: string }>;
  members: MemberRow[];
  circles: Record<string, CircleRow>;
  circleMembers: { circle: string; user: string }[];
  posts: Record<string, PostRow>;
  media: Record<string, MediaRow>;
  objects: Record<string, string>; // key -> base64 ciphertext
  hearts: { post: string; user: string }[];
  comments: Record<string, CommentRec>;
  seen: { post: string; user: string }[];
  pushTokens?: Record<string, { user: string; platform: PushPlatform }>;
  notifyPrefs?: Record<string, NotificationPrefs>;
  clientErrors?: ClientErrorReport[]; // key `${user}:${space}`
  invites: Record<string, InviteRow>;
  failures: Record<string, number[]>;
  appSession: string | null;
  lastTs: number;
}

const U = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
export const FIXTURE = {
  space: { id: U(0x100), name: 'Mia and Leo' },
  users: {
    chase: { id: U(1), email: 'chase@example.com', name: 'Chase' },
    alex: { id: U(2), email: 'alex@example.com', name: 'Alex' },
    jo: { id: U(3), email: 'jo@example.com', name: 'Grandma Jo' },
    ruth: { id: U(4), email: 'ruth@example.com', name: 'Nana Ruth' },
    earl: { id: U(5), email: 'earl@example.com', name: 'Grandpa Earl' },
    newbie: { id: U(6), email: 'kim@example.com', name: 'Aunt Kim' },
    newbie2: { id: U(7), email: 'tammy@example.com', name: 'Tammy' },
  },
  circles: {
    everyone: { id: U(0x200), name: 'Everyone' },
    dadSide: { id: U(0x201), name: "Grandparents – Dad's side" },
    momSide: { id: U(0x202), name: "Grandparents – Mom's side" },
  },
  invites: { jo: 'GRANDMAJ23', expired: 'EXPRDEXPRD' },
};

export interface FixtureOptions {
  /** Grandma Jo already joined (contract + screen tests) or still holds an invite (web smoke test). */
  joIsMember?: boolean;
}

export class FakeBackend {
  private listeners = new Set<() => void>();
  constructor(public state: FakeState, private persist?: (s: FakeState) => void) {}

  static empty(): FakeState {
    return {
      users: {}, spaces: {}, members: [], circles: {}, circleMembers: [], posts: {}, media: {}, objects: {},
      hearts: [], comments: {}, seen: [], invites: {}, failures: {}, appSession: null, lastTs: 0,
    };
  }

  static withFixture(opts: FixtureOptions = {}, persist?: (s: FakeState) => void): FakeBackend {
    const joIsMember = opts.joIsMember ?? true;
    const s = FakeBackend.empty();
    const F = FIXTURE;
    for (const u of Object.values(F.users)) s.users[u.id] = { ...u };
    s.spaces[F.space.id] = { ...F.space };
    const m = (user: string, role: Role, by: string | null) => s.members.push({ space: F.space.id, user, role, invited_by: by });
    m(F.users.chase.id, 'owner', null);
    m(F.users.alex.id, 'adult', F.users.chase.id);
    m(F.users.ruth.id, 'viewer', F.users.alex.id);
    m(F.users.earl.id, 'viewer', F.users.chase.id);
    if (joIsMember) m(F.users.jo.id, 'viewer', F.users.chase.id);
    for (const c of Object.values(F.circles)) s.circles[c.id] = { ...c, space: F.space.id, created_by: F.users.chase.id, deleted: false };
    const cm = (circle: string, ...users: string[]) => users.forEach((user) => s.circleMembers.push({ circle, user }));
    cm(F.circles.everyone.id, F.users.chase.id, F.users.alex.id, F.users.ruth.id, F.users.earl.id, ...(joIsMember ? [F.users.jo.id] : []));
    cm(F.circles.dadSide.id, F.users.chase.id, F.users.earl.id, ...(joIsMember ? [F.users.jo.id] : []));
    cm(F.circles.momSide.id, F.users.chase.id, F.users.alex.id, F.users.ruth.id);
    const far = new Date(Date.now() + 30 * 864e5).toISOString();
    s.invites[F.invites.jo] = {
      code: F.invites.jo, space: F.space.id, role: 'viewer', circles: [F.circles.dadSide.id, F.circles.everyone.id],
      created_by: F.users.chase.id, target_email: F.users.jo.email, expires_at: far, max_uses: 1, uses: joIsMember ? 1 : 0, revoked: false,
    };
    s.invites[F.invites.expired] = {
      code: F.invites.expired, space: F.space.id, role: 'viewer', circles: [F.circles.dadSide.id],
      created_by: F.users.chase.id, target_email: null, expires_at: new Date(Date.now() - 864e5).toISOString(), max_uses: 1, uses: 0, revoked: false,
    };
    return new FakeBackend(s, persist);
  }

  clientFor(userId: string | null, opts: { trackAppSession?: boolean; latencyMs?: number } = {}): HearthApi {
    return new FakeApi(this, userId, opts);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---------------- helpers ----------------
  changed(): void {
    this.persist?.(this.state);
    this.listeners.forEach((f) => f());
  }
  now(): string {
    const t = Math.max(Date.now(), this.state.lastTs + 1);
    this.state.lastTs = t;
    return new Date(t).toISOString();
  }
  member(space: string, user: string | null): MemberRow | undefined {
    return user ? this.state.members.find((m) => m.space === space && m.user === user) : undefined;
  }
  inCircle(circle: string, user: string): boolean {
    return this.state.circleMembers.some((x) => x.circle === circle && x.user === user);
  }
  circleMemberIds(circle: string): string[] {
    return this.state.circleMembers.filter((x) => x.circle === circle).map((x) => x.user);
  }
  /** can_view_post(): author (while a member), or a member of a circle in the audience. */
  canView(user: string | null, p: PostRow | undefined): p is PostRow {
    if (!user || !p || p.deleted) return false;
    if (!this.member(p.space, user)) return false;
    if (p.author === user) return true;
    if (p.status !== 'published') return false;
    return p.circles.some((c) => !this.state.circles[c]?.deleted && this.inCircle(c, user));
  }
  visiblePost(user: string | null, post: string): PostRow {
    const p = this.state.posts[post];
    if (!this.canView(user, p)) throw new ApiError('P0002', 'not found');
    return p;
  }
  requireUser(user: string | null): string {
    if (!user) throw new ApiError('42501', 'sign in required');
    return user;
  }
  isPoster(space: string, user: string): boolean {
    const r = this.member(space, user)?.role;
    return r === 'owner' || r === 'adult';
  }
  rateLimited(key: string): boolean {
    const now = Date.now();
    const list = (this.state.failures[key] ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    this.state.failures[key] = list;
    return list.length >= RATE_MAX_FAILURES;
  }
  fail(key: string): never {
    (this.state.failures[key] ??= []).push(Date.now());
    this.changed();
    throw new ApiError('22023', 'invalid invite');
  }
  findInvite(code: string): InviteRow | undefined {
    return this.state.invites[code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')];
  }
  inviteUsable(inv: InviteRow | undefined): inv is InviteRow {
    return !!inv && !inv.revoked && inv.uses < inv.max_uses && new Date(inv.expires_at).getTime() > Date.now();
  }
  signUrl(op: 'get' | 'put', key: string): string {
    return `fake://b2/${encodeURIComponent(key)}?op=${op}&exp=${Date.now() + TTL_MS}`;
  }
  parseUrl(url: string, op: 'get' | 'put'): string {
    const m = /^fake:\/\/b2\/([^?]+)\?op=(get|put)&exp=(\d+)$/.exec(url);
    if (!m || m[2] !== op) throw new ApiError('42501', 'bad signature');
    if (Number(m[3]) < Date.now()) throw new ApiError('42501', 'url expired');
    return decodeURIComponent(m[1]!);
  }

  // ---------------- RPCs (caller = user id or null for anon) ----------------
  mySpaces(user: string | null): Space[] {
    const me = this.requireUser(user);
    return this.state.members.filter((m) => m.user === me).map((m) => ({
      space_id: m.space,
      name: this.state.spaces[m.space]!.name,
      role: m.role,
      inviter_name: m.invited_by ? this.state.users[m.invited_by]?.name ?? null : null,
      can_post: m.role === 'owner' || m.role === 'adult',
    }));
  }

  myCircles(user: string | null, space: string): Circle[] {
    const me = this.requireUser(user);
    if (!this.isPoster(space, me)) return [];
    return Object.values(this.state.circles)
      .filter((c) => c.space === space && !c.deleted && (c.created_by === me || this.inCircle(c.id, me)))
      .map((c) => {
        const ids = this.circleMemberIds(c.id);
        return { circle_id: c.id, name: c.name, member_count: ids.length, member_names: ids.map((i) => this.state.users[i]?.name ?? '?') };
      });
  }

  getFeed(user: string | null, a: FeedArgs): FeedPost[] {
    const me = this.requireUser(user);
    const limit = Math.max(1, Math.min(50, a.limit ?? 20));
    const rows = Object.values(this.state.posts)
      .filter((p) => p.space === a.space && p.status === 'published' && this.canView(me, p))
      .sort((x, y) => (x.published_at! < y.published_at! ? 1 : x.published_at! > y.published_at! ? -1 : x.id < y.id ? 1 : -1))
      .filter((p) => !a.beforeTs || p.published_at! < a.beforeTs || (p.published_at === a.beforeTs && !!a.beforeId && p.id < a.beforeId))
      .slice(0, limit);
    return rows.map((p) => {
      const mine = p.author === me;
      const reach = new Set(p.circles.flatMap((c) => this.circleMemberIds(c)).filter((u) => u !== p.author));
      const hearts = this.state.hearts.filter((h) => h.post === p.id);
      return {
        post_id: p.id,
        author_id: p.author,
        author_name: this.state.users[p.author]?.name ?? '',
        caption: p.caption,
        published_at: p.published_at!,
        media: Object.values(this.state.media).filter((m) => m.post === p.id).sort((x, y) => x.position - y.position)
          .map((m) => ({ media_id: m.id, kind: m.kind, width: m.width, height: m.height, duration_ms: m.duration_ms, status: m.status })),
        heart_count: hearts.length,
        i_hearted: hearts.some((h) => h.user === me),
        comment_count: Object.values(this.state.comments).filter((c) => c.post === p.id).length,
        audience: mine ? p.circles.map((c) => ({ circle_id: c, name: this.state.circles[c]!.name, member_count: this.circleMemberIds(c).length })) : null,
        seen_count: mine ? this.state.seen.filter((s) => s.post === p.id && reach.has(s.user)).length : null,
        reach_count: mine ? reach.size : null,
      };
    });
  }

  createPost(user: string | null, a: CreatePostArgs): string {
    const me = this.requireUser(user);
    const existing = Object.values(this.state.posts).find((p) => p.author === me && p.client_id === a.clientId);
    if (existing) return existing.id;
    if (!this.member(a.space, me)) throw new ApiError('42501', 'not a member');
    if (!this.isPoster(a.space, me)) throw new ApiError('42501', 'viewers cannot post');
    if (!a.circleIds.length) throw new ApiError('23514', 'at least one circle');
    if (a.circleIds.some((c) => this.state.circles[c]?.space !== a.space || this.state.circles[c]?.deleted)) throw new ApiError('23514', 'circle not in space');
    const id = uuid();
    this.state.posts[id] = {
      id, space: a.space, author: me, caption: a.caption?.trim() || null, status: 'draft', deleted: false,
      circles: [...new Set(a.circleIds)], client_id: a.clientId, created_at: this.now(), published_at: null,
    };
    this.changed();
    return id;
  }

  authorPost(user: string | null, post: string): PostRow {
    const me = this.requireUser(user);
    const p = this.state.posts[post];
    if (!this.canView(me, p)) throw new ApiError('P0002', 'not found');
    if (p.author !== me) throw new ApiError('42501', 'author only');
    return p;
  }

  publishPost(user: string | null, post: string): void {
    const p = this.authorPost(user, post);
    if (p.status === 'published') return;
    const media = Object.values(this.state.media).filter((m) => m.post === post);
    // Backend 0002: at least one media item, and all of them ready.
    if (!media.length || media.some((m) => m.status !== 'ready')) throw new ApiError('23514', 'media not ready');
    p.status = 'published';
    p.published_at = this.now();
    this.changed();
  }

  deletePost(user: string | null, post: string): void {
    const me = this.requireUser(user);
    const p = this.state.posts[post];
    if (p && p.deleted && p.author === me) return; // idempotent
    const row = this.authorPost(me, post);
    row.deleted = true;
    this.changed();
  }

  toggleHeart(user: string | null, post: string): HeartState {
    const me = this.requireUser(user);
    const p = this.visiblePost(me, post);
    if (p.status !== 'published') throw new ApiError('P0002', 'not found');
    const i = this.state.hearts.findIndex((h) => h.post === post && h.user === me);
    if (i >= 0) this.state.hearts.splice(i, 1);
    else this.state.hearts.push({ post, user: me });
    this.changed();
    return { i_hearted: i < 0, heart_count: this.state.hearts.filter((h) => h.post === post).length };
  }

  addComment(user: string | null, a: AddCommentArgs): { comment_id: string; created_at: string } {
    const me = this.requireUser(user);
    const existing = Object.values(this.state.comments).find((c) => c.author === me && c.client_id === a.clientId);
    if (existing) return { comment_id: existing.id, created_at: existing.created_at };
    this.visiblePost(me, a.post);
    const body = a.body.trim();
    if (body.length < 1 || body.length > 500) throw new ApiError('23514', 'comment length');
    const id = uuid();
    const created_at = this.now();
    this.state.comments[id] = { id, post: a.post, author: me, body, created_at, client_id: a.clientId };
    this.changed();
    return { comment_id: id, created_at };
  }

  getComments(user: string | null, post: string, limit = 50): CommentRow[] {
    const me = this.requireUser(user);
    const p = this.state.posts[post];
    if (!this.canView(me, p)) return [];
    return Object.values(this.state.comments).filter((c) => c.post === post)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).slice(0, Math.min(limit, 200))
      .map((c) => ({ comment_id: c.id, author_id: c.author, author_name: this.state.users[c.author]?.name ?? '', body: c.body, created_at: c.created_at }));
  }

  registerPushToken(user: string | null, token: string, platform: PushPlatform): void {
    const me = this.requireUser(user);
    if (!/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) throw new ApiError('23514', 'not an Expo push token');
    if (!['ios', 'android', 'web'].includes(platform)) throw new ApiError('23514', 'unknown platform');
    (this.state.pushTokens ??= {})[token] = { user: me, platform };
    this.changed();
  }

  myProfile(user: string | null): MyProfile {
    const me = this.requireUser(user);
    const u = this.state.users[me]!;
    return { user_id: me, display_name: u.name, name_set: u.nameSet !== false };
  }

  setMyName(user: string | null, name: string): void {
    const me = this.requireUser(user);
    if (!validName(name)) throw new ApiError('23514', 'a name is 1-40 characters, not an email address');
    const u = this.state.users[me]!;
    u.name = name.trim();
    u.nameSet = true;
    this.changed();
  }

  /** Same rules as the SQL: fixed-shape fields only, so no user content can get in. */
  reportClientError(r: ClientErrorReport): void {
    const ok = /^[0-9A-Za-z.+-]{1,20}$/.test(r.appVersion) && /^(ios|android|web)( [0-9.]{1,12})?$/.test(r.os)
      && /^[A-Za-z0-9_/[\]-]{1,40}$/.test(r.screen) && /^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(r.kind)
      && (r.code === undefined || /^[A-Za-z0-9_]{1,20}$/.test(r.code));
    if (!ok) throw new ApiError('23514', 'error reports take fixed fields only');
    (this.state.clientErrors ??= []).push({ ...r });
    this.changed();
  }

  setNotificationPrefs(user: string | null, space: string, p: NotificationPrefs): void {
    const me = this.requireUser(user);
    if (!this.member(space, me)) throw new ApiError('P0002', 'not found');
    if (typeof p.push !== 'boolean' || !['off', 'daily', 'weekly'].includes(p.emailDigest)) {
      throw new ApiError('23514', 'email choice must be off, daily or weekly');
    }
    (this.state.notifyPrefs ??= {})[`${me}:${space}`] = { push: p.push, emailDigest: p.emailDigest };
    this.changed();
  }

  markSeen(user: string | null, post: string): void {
    const me = this.requireUser(user);
    this.visiblePost(me, post);
    if (!this.state.seen.some((s) => s.post === post && s.user === me)) {
      this.state.seen.push({ post, user: me });
      this.changed();
    }
  }

  invitePreview(user: string | null, code: string): InvitePreview {
    const key = `preview:${user ?? 'anon'}`;
    if (this.rateLimited(key)) throw new ApiError('54000', 'rate limited');
    const inv = this.findInvite(code);
    if (!this.inviteUsable(inv)) this.fail(key);
    return { inviter_name: this.state.users[inv.created_by]?.name ?? '', space_name: this.state.spaces[inv.space]!.name };
  }

  redeemInvite(user: string | null, code: string): string {
    const me = this.requireUser(user);
    const key = `redeem:${me}`;
    if (this.rateLimited(key)) throw new ApiError('54000', 'rate limited');
    const inv = this.findInvite(code);
    if (!this.inviteUsable(inv)) this.fail(key);
    const email = this.state.users[me]?.email.toLowerCase();
    if (inv.target_email && inv.target_email.toLowerCase() !== email) this.fail(key);
    if (this.member(inv.space, me)) this.fail(key);
    inv.uses += 1;
    this.state.members.push({ space: inv.space, user: me, role: inv.role, invited_by: inv.created_by });
    const u = this.state.users[me];
    if (u && inv.name && u.nameSet === false) { u.name = inv.name; u.nameSet = true; } // JOIN-1
    for (const c of inv.circles) if (!this.inCircle(c, me)) this.state.circleMembers.push({ circle: c, user: me });
    this.changed();
    return inv.space;
  }

  createInvite(user: string | null, a: CreateInviteArgs): { code: string; link: string } {
    const me = this.requireUser(user);
    if (!this.isPoster(a.space, me)) throw new ApiError('42501', 'only posters invite');
    if (a.role !== 'viewer' && this.member(a.space, me)?.role !== 'owner') throw new ApiError('42501', 'only owners invite adults');
    if (!a.circleIds.length) throw new ApiError('23514', 'at least one circle');
    if (a.circleIds.some((c) => this.state.circles[c]?.space !== a.space)) throw new ApiError('23514', 'circle not in space');
    if (a.name != null && !validName(a.name)) throw new ApiError('23514', 'a name is 1-40 characters, not an email address');
    const bytes = randomBytes(10);
    const code = Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
    const days = Math.min(30, a.ttlDays ?? 30);
    this.state.invites[code] = {
      code, space: a.space, role: a.role, circles: [...a.circleIds], created_by: me, target_email: a.targetEmail?.toLowerCase() ?? null,
      expires_at: new Date(Date.now() + days * 864e5).toISOString(), max_uses: a.maxUses ?? 1, uses: 0, revoked: false,
      name: a.name?.trim() || null,
    };
    this.changed();
    return { code, link: `https://hearth.family/join/${code}` };
  }

  renameCircle(user: string | null, circle: string, name: string): void {
    const me = this.requireUser(user);
    const c = this.state.circles[circle];
    if (!c || c.deleted || !this.isPoster(c.space, me)) throw new ApiError('P0002', 'not found');
    const n = name.trim();
    if (n.length < 1 || n.length > 60) throw new ApiError('23514', 'name length');
    if (Object.values(this.state.circles).some((o) => o.id !== circle && o.space === c.space && !o.deleted && o.name === n)) throw new ApiError('23514', 'name taken');
    c.name = n;
    this.changed();
  }

  // ---------------- sign-media ----------------
  signUpload(user: string | null, post: string, items: UploadItemSpec[]): UploadGrant {
    const me = this.requireUser(user);
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw new ApiError('23514', 'items 1..20');
    if (items.some((i) => i?.exif_stripped !== true)) throw new ApiError('EXIF', 'exif_not_stripped');
    const p = this.authorPost(me, post);
    const base = Object.values(this.state.media).filter((m) => m.post === post).length;
    const out = items.map((it, idx) => {
      const id = uuid();
      const dek = toBase64(randomBytes(32));
      const prefix = `s/${p.space}/p/${p.id}/m/${id}`;
      this.state.media[id] = {
        id, post, position: base + idx, kind: it.kind, mime: it.mime_type, width: it.width, height: it.height,
        duration_ms: it.duration_ms ?? null, byte_size: it.byte_size, thumb_byte_size: it.thumb_byte_size, status: 'pending',
        dek, display_key: `${prefix}/display`, thumb_key: `${prefix}/thumb`, uploader: me,
      };
      return {
        media_id: id, item_index: idx, dek, enc_scheme: 'aes-256-gcm-chunked-v1',
        display_put_url: this.signUrl('put', `${prefix}/display`), thumb_put_url: this.signUrl('put', `${prefix}/thumb`),
        required_headers: { 'content-type': 'application/octet-stream' },
      };
    });
    this.changed();
    return { post_id: post, expires_in: TTL_MS / 1000, items: out };
  }

  putObject(url: string, bytes: Uint8Array, headers: Record<string, string>): void {
    const key = this.parseUrl(url, 'put');
    if (headers['content-type'] !== 'application/octet-stream') throw new ApiError('42501', 'signed header mismatch');
    this.state.objects[key] = toBase64(bytes);
    this.changed();
  }

  finalizeMedia(user: string | null, ids: string[]): FinalizeResult[] {
    const me = this.requireUser(user);
    const out: FinalizeResult[] = [];
    for (const id of ids) {
      const m = this.state.media[id];
      if (!m || m.uploader !== me || m.status !== 'pending') continue;
      const d = this.state.objects[m.display_key];
      const t = this.state.objects[m.thumb_key];
      const ok = !!d && !!t && fromBase64(d).length === m.byte_size && fromBase64(t).length === m.thumb_byte_size;
      m.status = ok ? 'ready' : 'failed';
      out.push({ media_id: id, ok });
    }
    this.changed();
    return out;
  }

  signView(user: string | null, post: string): ViewGrant {
    const me = this.requireUser(user);
    this.visiblePost(me, post);
    const items = Object.values(this.state.media).filter((m) => m.post === post && m.status === 'ready')
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        id: m.id, position: m.position, kind: m.kind, mime_type: m.mime, width: m.width, height: m.height,
        duration_ms: m.duration_ms, byte_size: m.byte_size, enc_scheme: 'aes-256-gcm-chunked-v1', dek: m.dek,
        display_url: this.signUrl('get', m.display_key), thumb_url: this.signUrl('get', m.thumb_key),
      }));
    return { post_id: post, expires_in: TTL_MS / 1000, items };
  }

  getObject(url: string): Uint8Array {
    const key = this.parseUrl(url, 'get');
    const b = this.state.objects[key];
    if (!b) throw new ApiError('P0002', 'no object');
    return fromBase64(b);
  }

  // ---------------- auth ----------------
  userByEmail(email: string): UserRow {
    const e = email.trim().toLowerCase();
    let u = Object.values(this.state.users).find((x) => x.email === e);
    if (!u) {
      const id = uuid();
      const local = e.split('@')[0] ?? e;
      u = { id, email: e, name: local, nameSet: false }; // like the SQL trigger: email prefix, not set
      this.state.users[id] = u;
      this.changed();
    }
    return u;
  }
}

/** Same rule as private.valid_name (migration 0007). */
const validName = (n: string) => { const t = n.trim(); return t.length >= 1 && t.length <= 40 && !/[@<>\r\n\t]/.test(t); };

const clone = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

/** HearthApi bound to one caller. All results are copies, like a real network call. */
export class FakeApi implements HearthApi {
  private ownUser: string | null;
  constructor(private be: FakeBackend, userId: string | null, private opts: { trackAppSession?: boolean; latencyMs?: number } = {}) {
    this.ownUser = userId;
  }

  /** The app-mode client follows the persisted session; test clients keep their own. */
  private get userId(): string | null {
    return this.opts.trackAppSession ? this.be.state.appSession : this.ownUser;
  }
  private set userId(v: string | null) {
    if (this.opts.trackAppSession) this.be.state.appSession = v;
    else this.ownUser = v;
  }

  private async run<T>(f: () => T): Promise<T> {
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    else await Promise.resolve();
    return clone(f());
  }

  async getSession(): Promise<Session | null> {
    return this.run(() => {
      const u = this.userId ? this.be.state.users[this.userId] : undefined;
      return u ? { userId: u.id, email: u.email } : null;
    });
  }
  sendCode(email: string): Promise<void> {
    return this.run(() => {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) throw new ApiError('23514', 'bad email');
    });
  }
  verifyCode(email: string, code: string): Promise<Session> {
    return this.run(() => {
      if (code.trim() !== FAKE_OTP) throw new ApiError('BAD_OTP');
      const u = this.be.userByEmail(email);
      this.userId = u.id;
      if (this.opts.trackAppSession) {
        this.be.state.appSession = u.id;
        this.be.changed();
      }
      return { userId: u.id, email: u.email };
    });
  }
  signOut(): Promise<void> {
    return this.run(() => {
      this.userId = null;
      if (this.opts.trackAppSession) {
        this.be.state.appSession = null;
        this.be.changed();
      }
    });
  }

  mySpaces = () => this.run(() => this.be.mySpaces(this.userId));
  myCircles = (space: string) => this.run(() => this.be.myCircles(this.userId, space));
  getFeed = (a: FeedArgs) => this.run(() => this.be.getFeed(this.userId, a));
  createPost = (a: CreatePostArgs) => this.run(() => this.be.createPost(this.userId, a));
  publishPost = (p: string) => this.run(() => this.be.publishPost(this.userId, p));
  deletePost = (p: string) => this.run(() => this.be.deletePost(this.userId, p));
  toggleHeart = (p: string) => this.run(() => this.be.toggleHeart(this.userId, p));
  addComment = (a: AddCommentArgs) => this.run(() => this.be.addComment(this.userId, a));
  getComments = (p: string, limit?: number) => this.run(() => this.be.getComments(this.userId, p, limit));
  markSeen = (p: string) => this.run(() => this.be.markSeen(this.userId, p));
  registerPushToken = (t: string, platform: PushPlatform) => this.run(() => this.be.registerPushToken(this.userId, t, platform));
  reportClientError = (r: ClientErrorReport) => this.run(() => this.be.reportClientError(r));
  myProfile = () => this.run(() => this.be.myProfile(this.userId));
  setMyName = (n: string) => this.run(() => this.be.setMyName(this.userId, n));
  setNotificationPrefs = (space: string, p: NotificationPrefs) => this.run(() => this.be.setNotificationPrefs(this.userId, space, p));
  redeemInvite = (c: string) => this.run(() => this.be.redeemInvite(this.userId, c));
  invitePreview = (c: string) => this.run(() => this.be.invitePreview(this.userId, c));
  createInvite = (a: CreateInviteArgs) => this.run(() => this.be.createInvite(this.userId, a));
  signUpload = (p: string, items: UploadItemSpec[]) => this.run(() => this.be.signUpload(this.userId, p, items));
  putObject = (url: string, bytes: Uint8Array, headers: Record<string, string>) => this.run(() => this.be.putObject(url, bytes, headers));
  finalizeMedia = (ids: string[]) => this.run(() => this.be.finalizeMedia(this.userId, ids));
  signView = (p: string) => this.run(() => this.be.signView(this.userId, p));
  getObject = async (url: string) => {
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    return this.be.getObject(url).slice();
  };
  renameCircle = (c: string, name: string) => this.run(() => this.be.renameCircle(this.userId, c, name));
}
