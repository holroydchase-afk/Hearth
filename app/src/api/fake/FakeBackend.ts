// In-memory Hearth backend for tests, the web smoke test and offline demos.
// It enforces the same rules API.md promises: visibility via can_view_post, idempotency on
// p_client_id, author-only fields, the error codes, invite rules and the S10 rate limit.
// It is NOT a security boundary; it exists so the app can be built and tested against the
// contract before the real stack is reachable. The contract tests keep the two honest.
import { ApiError, type HearthApi } from '../HearthApi';
import { JOIN_LINK_BASE } from '../links';
import type {
  CircleKind,
  CommentMode,
  Person,
  ReplyAudience,
  ReplyScope,
  ShareHistory,
  ClientErrorReport,
  MyProfile,
  NotificationPrefs,
  PushPlatform,
  AddCommentArgs, Circle, CommentRow, CreateInviteArgs, CreatePostArgs, FeedArgs, FeedPost, FinalizeResult,
  HeartState, InvitePreview, MediaKind, MediaStatus, Role, Session, Space, UploadGrant, UploadItemSpec, ViewGrant,
  TimelineArgs, TimelinePost, TimelineYear,
  ChatKind, ChatMember, ChatRow, ChatRowKind, ChatSummary, ClaimedKeyPackage,
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
interface CircleRow { id: string; space: string; name: string; created_by: string; deleted: boolean; kind?: CircleKind; comment_mode?: CommentMode }
interface PostRow {
  id: string; space: string; author: string; caption: string | null; status: 'draft' | 'published';
  deleted: boolean; circles: string[]; client_id: string; created_at: string; published_at: string | null;
  /** 0010: capture time read on the phone; batch id/size of a bulk pick. */
  taken_at?: string | null; batch_id?: string | null; batch_size?: number | null;
}
interface MediaRow {
  id: string; post: string; position: number; kind: MediaKind; mime: string; width: number; height: number;
  duration_ms: number | null; byte_size: number; thumb_byte_size: number; status: MediaStatus; dek: string;
  display_key: string; thumb_key: string; uploader: string;
}
interface CommentRec { id: string; post: string; author: string; body: string; created_at: string; client_id: string }
interface InviteRow {
  code: string; space: string; role: Role; circles: string[]; created_by: string; target_email: string | null;
  expires_at: string; max_uses: number; uses: number; revoked: boolean; name?: string | null; history?: ShareHistory | null;
  /** Server invites.household_means_everyone: only invites made before 0013 (PRIV-G2). */
  householdMeansEveryone?: boolean;
}

export interface FakeState {
  users: Record<string, UserRow>;
  spaces: Record<string, { id: string; name: string; reply_audience?: ReplyAudience }>;
  members: MemberRow[];
  circles: Record<string, CircleRow>;
  /** `at`: when they were added (ISO); fixture rows have none and count as always there. */
  circleMembers: { circle: string; user: string; at?: string }[];
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
  /** FLAG (0013): global switch per feature (Hearth only) and the family add-on, keyed `${space}:${feature}`. */
  featureFlags?: Record<string, boolean>;
  spaceFeatures?: Record<string, boolean>;
  /** 0015 messenger relay: opaque base64 MLS bytes only. */
  chat?: {
    devices: Record<string, string>;
    keyPackages: { user: string; kp: string }[];
    groups: string[];
    rows: (ChatRow & { circle: string; recipient: string | null })[];
  };
}

/** 0013: a new circle's comment setting by kind (households stay 'always'). */
const defaultMode = (k: CircleKind | undefined): CommentMode => (k === 'household' ? 'always' : k === 'event' ? 'on_group_posts' : 'private');
const MODES: CommentMode[] = ['private', 'on_group_posts', 'always'];
/** private.feature_capability: who may use each feature (parents only to start; the fake's posters are the parents). */
const FEATURE_CAPABILITY: Record<string, 'use_video' | 'post'> = {
  video_posting: 'use_video', photo_helpers_duplicates: 'post', photo_helpers_screens_blur: 'post',
};
/** private.feature_default_on (0016): a missing row means off for add-ons, on for off-switches (HELP-R4). */
const FEATURE_DEFAULT_ON = new Set(['photo_helpers_duplicates', 'photo_helpers_screens_blur']);

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
  /** DEMO-1: the demo build seeds pictures asynchronously; app calls wait for it (tests leave it unset). */
  ready: Promise<void> | null = null;
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
    for (const c of Object.values(F.circles)) {
      s.circles[c.id] = { ...c, space: F.space.id, created_by: F.users.chase.id, deleted: false, kind: c.id === F.circles.everyone.id ? 'everyone' : 'group' };
    }
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
    if (this.isPoster(p.space, user)) return true; // 0011 / SPEC-GROUPS: parents see every published post
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
  /** public.can_see_reply (0011) for the flat groups the fake knows: no households or events here, so a
   *  relative's reply reaches the parents and the post's author (unless the family opened replies). */
  canSeeReply(viewer: string, p: PostRow, author: string): boolean {
    if (!this.canView(viewer, p)) return false;
    return author === viewer || p.author === viewer || p.author === author
      || this.isPoster(p.space, viewer) || this.isPoster(p.space, author)
      || (this.state.spaces[p.space]?.reply_audience ?? 'parents') === 'everyone';
  }

  replyScope(viewer: string, p: PostRow): ReplyScope {
    if (p.author === viewer || this.isPoster(p.space, viewer) || (this.state.spaces[p.space]?.reply_audience ?? 'parents') === 'everyone') return 'everyone';
    return 'parents';
  }

  /** reply_readers (0011, REPLY-11): who reads the caller's reply on this post, by name; null = not found. */
  replyReaders(user: string | null, post: string): string[] | null {
    const me = this.requireUser(user);
    const p = this.state.posts[post];
    if (!this.canView(me, p)) return null;
    return this.state.members
      .filter((m) => m.space === p.space && m.user !== me && this.canSeeReply(m.user, p, me))
      .map((m) => this.state.users[m.user]?.name ?? '?')
      .sort();
  }

  setReplyAudience(user: string | null, space: string, choice: ReplyAudience): void {
    const me = this.requireUser(user);
    const m = this.member(space, me);
    if (!m) throw new ApiError('P0002', 'not found');
    if (m.role !== 'owner') throw new ApiError('42501', 'only the owner can change this');
    if (choice !== 'parents' && choice !== 'everyone') throw new ApiError('23514', 'choose parents or everyone');
    this.state.spaces[space]!.reply_audience = choice;
    this.changed();
  }

  // ---- messenger relay (0015): same rules as tests/chat_test.sql, minus the joined-at cutoff ----
  private get chat() {
    return (this.state.chat ??= { devices: {}, keyPackages: [], groups: [], rows: [] });
  }
  /** private.chat_people: the circle's members plus the family's parents; households have no chat. */
  chatPeople(circle: string): string[] {
    const c = this.state.circles[circle];
    if (!c || c.deleted || c.kind === 'household') return [];
    const ids = new Set(this.circleMemberIds(circle).filter((u) => this.member(c.space, u)));
    for (const m of this.state.members) if (m.space === c.space && this.isPoster(c.space, m.user)) ids.add(m.user);
    return [...ids];
  }
  private chatMe(user: string | null, circle: string): string {
    const me = this.requireUser(user);
    if (!this.chatPeople(circle).includes(me)) throw new ApiError('P0002', 'not found');
    return me;
  }
  chatList(user: string | null, space: string): ChatSummary[] {
    const me = this.requireUser(user);
    if (!this.member(space, me)) throw new ApiError('P0002', 'not found');
    const parent = this.isPoster(space, me);
    const order = { everyone: 0, group: 1, event: 2 } as Record<string, number>;
    return Object.values(this.state.circles)
      .filter((c) => c.space === space && this.chatPeople(c.id).includes(me))
      .map((c) => {
        const kind = (c.kind ?? 'group') as ChatKind;
        const others = this.chatPeople(c.id).filter((u) => u !== me).map((u) => this.state.users[u]?.name ?? '?').sort();
        const people = others.length === 0 ? 'Just you' : others.length === 1 ? others[0]!
          : others.length <= 3 ? `${others.slice(0, -1).join(', ')} and ${others.at(-1)}` : `${others[0]}, ${others[1]} and ${others.length - 2} more`;
        const named = parent || kind !== 'group';
        return { circle_id: c.id, kind, title: named ? c.name : people, named, member_count: this.chatPeople(c.id).length };
      })
      .sort((a, b) => (order[a.kind]! - order[b.kind]!) || a.title.localeCompare(b.title));
  }
  chatPublishDevice(user: string | null, signatureKey: string, keyPackages: string[]): void {
    const me = this.requireUser(user);
    if (!signatureKey) throw new ApiError('23514', 'signing key must be base64');
    if (keyPackages.length < 1 || keyPackages.length > 50) throw new ApiError('23514', 'publish 1-50 key packages');
    if (this.chat.devices[me] !== signatureKey) this.chat.keyPackages = this.chat.keyPackages.filter((k) => k.user !== me);
    this.chat.devices[me] = signatureKey;
    for (const kp of keyPackages) this.chat.keyPackages.push({ user: me, kp });
    this.changed();
  }
  chatKeyPackageCount(user: string | null): number {
    const me = this.requireUser(user);
    return this.chat.keyPackages.filter((k) => k.user === me).length;
  }
  chatStart(user: string | null, circle: string): boolean {
    this.chatMe(user, circle);
    if (this.chat.groups.includes(circle)) return false;
    this.chat.groups.push(circle);
    this.changed();
    return true;
  }
  chatRoster(user: string | null, circle: string): ChatMember[] {
    this.chatMe(user, circle);
    return this.chatPeople(circle)
      .map((u) => ({ user_id: u, name: this.state.users[u]?.name ?? '?', signature_key: this.chat.devices[u] ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  chatClaim(user: string | null, circle: string, users: string[]): ClaimedKeyPackage[] {
    this.chatMe(user, circle);
    const people = this.chatPeople(circle);
    const out: ClaimedKeyPackage[] = [];
    for (const u of new Set(users)) {
      if (!people.includes(u)) continue;
      const i = this.chat.keyPackages.findIndex((k) => k.user === u);
      if (i < 0) continue;
      out.push({ user_id: u, key_package: this.chat.keyPackages[i]!.kp });
      this.chat.keyPackages.splice(i, 1);
    }
    if (out.length) this.changed();
    return out;
  }
  chatSend(user: string | null, circle: string, kind: ChatRowKind, epoch: number, body: string, recipient?: string): number {
    const me = this.chatMe(user, circle);
    if (!['commit', 'welcome', 'message'].includes(kind)) throw new ApiError('23514', 'bad kind');
    if ((kind === 'welcome') !== !!recipient) throw new ApiError('23514', 'a welcome (and only a welcome) names who it is for');
    if (recipient && !this.chatPeople(circle).includes(recipient)) throw new ApiError('23514', 'that person is not in this group');
    if (!(epoch >= 0) || !/^[A-Za-z0-9+/]+={0,2}$/.test(body) || body.length % 4 !== 0 || body.length > 65536) throw new ApiError('23514', 'bad body');
    if (kind === 'commit' && this.chat.rows.some((r) => r.circle === circle && r.kind === 'commit' && r.epoch === epoch)) {
      throw new ApiError('23505', 'another phone changed the keys first');
    }
    const id = (this.chat.rows.at(-1)?.id ?? 0) + 1;
    this.chat.rows.push({ id, circle, sender_id: me, kind, epoch, body, recipient: recipient ?? null, created_at: new Date().toISOString() });
    this.changed();
    return id;
  }
  /** 0015 chat_member_since: parents count from the start; others from when they were added to the group (T10). */
  private chatSince(circle: string, me: string): string {
    const c = this.state.circles[circle]!;
    if (this.isPoster(c.space, me)) return '';
    const row = this.state.circleMembers.find((x) => x.circle === circle && x.user === me);
    return row?.at ?? '';
  }
  chatFetch(user: string | null, circle: string, after: number, limit = 200): ChatRow[] {
    const me = this.chatMe(user, circle);
    const since = this.chatSince(circle, me);
    return this.chat.rows
      .filter((r) => r.circle === circle && r.id > after && r.created_at >= since && (!r.recipient || r.recipient === me))
      .slice(0, Math.min(Math.max(limit, 1), 500))
      .map(({ circle: _c, recipient: _r, ...row }) => row);
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
  /** Server: private.invite_places. The fake has no households: a relative's invite needs every group live. */
  invitePlaces(inv: InviteRow): boolean {
    return inv.role !== 'viewer' || (inv.circles.length > 0 && inv.circles.every((c) => this.state.circles[c] && !this.state.circles[c]!.deleted));
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
      reply_audience: this.state.spaces[m.space]!.reply_audience ?? 'parents',
    }));
  }

  myCircles(user: string | null, space: string): Circle[] {
    const me = this.requireUser(user);
    if (!this.isPoster(space, me)) return [];
    return Object.values(this.state.circles)
      .filter((c) => c.space === space && !c.deleted && (c.created_by === me || this.inCircle(c.id, me)))
      .map((c) => {
        const ids = this.circleMemberIds(c.id);
        return {
          circle_id: c.id, name: c.name, member_count: ids.length, member_names: ids.map((i) => this.state.users[i]?.name ?? '?').sort(),
          kind: c.kind ?? 'group', parent_ids: [], comment_mode: c.comment_mode ?? defaultMode(c.kind),
        };
      });
  }

  /** private.visible_posts (0010): the one visibility check for feed, timeline and years. */
  visiblePosts(me: string, space: string): PostRow[] {
    return Object.values(this.state.posts).filter((p) => p.space === space && p.status === 'published' && this.canView(me, p));
  }

  getFeed(user: string | null, a: FeedArgs): FeedPost[] {
    const me = this.requireUser(user);
    const limit = Math.max(1, Math.min(50, a.limit ?? 20));
    const rows = this.visiblePosts(me, a.space)
      .sort((x, y) => (x.published_at! < y.published_at! ? 1 : x.published_at! > y.published_at! ? -1 : x.id < y.id ? 1 : -1))
      .filter((p) => !a.beforeTs || p.published_at! < a.beforeTs || (p.published_at === a.beforeTs && !!a.beforeId && p.id < a.beforeId))
      .slice(0, limit);
    return rows.map((p) => this.feedRow(me, p));
  }

  /** get_timeline (0010): newest taken first; keyset on (sort_at, id). */
  getTimeline(user: string | null, a: TimelineArgs): TimelinePost[] {
    const me = this.requireUser(user);
    const limit = Math.max(1, Math.min(50, a.limit ?? 20));
    const sortAt = (p: PostRow) => p.taken_at ?? p.published_at!;
    const ms = (t: string) => new Date(t).getTime();
    const before = a.beforeAt ? ms(a.beforeAt) : null;
    return this.visiblePosts(me, a.space)
      .sort((x, y) => ms(sortAt(y)) - ms(sortAt(x)) || (x.id < y.id ? 1 : -1))
      .filter((p) => before === null || ms(sortAt(p)) < before || (ms(sortAt(p)) === before && !!a.beforeId && p.id < a.beforeId))
      .slice(0, limit)
      .map((p) => ({ ...this.feedRow(me, p), taken_at: p.taken_at ?? null, sort_at: sortAt(p) }));
  }

  /** get_timeline_years (0010): year of sort_at in the phone's zone; ready photos only. */
  getTimelineYears(user: string | null, space: string, timeZone = 'UTC'): TimelineYear[] {
    const me = this.requireUser(user);
    let fmt: Intl.DateTimeFormat;
    try {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' });
    } catch {
      throw new ApiError('22023', 'unknown time zone');
    }
    const years = new Map<number, { post_count: number; photo_count: number }>();
    for (const p of this.visiblePosts(me, space)) {
      const y = Number(fmt.format(new Date(p.taken_at ?? p.published_at!)));
      const photos = Object.values(this.state.media).filter((m) => m.post === p.id && m.kind === 'photo' && m.status === 'ready').length;
      const cur = years.get(y) ?? { post_count: 0, photo_count: 0 };
      years.set(y, { post_count: cur.post_count + 1, photo_count: cur.photo_count + photos });
    }
    return [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, c]) => ({ year, ...c }));
  }

  /** The feed row (get_feed and get_timeline share it, like private.feed_rows). */
  private feedRow(me: string, p: PostRow): FeedPost {
      const mine = p.author === me;
      const reach = new Set(p.circles.flatMap((c) => this.circleMemberIds(c)).filter((u) => u !== p.author));
      const hearts = this.state.hearts.filter((h) => h.post === p.id && this.canSeeReply(me, p, h.user));
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
        comment_count: Object.values(this.state.comments).filter((c) => c.post === p.id && this.canSeeReply(me, p, c.author)).length,
        audience: mine ? p.circles.map((c) => ({ circle_id: c, name: this.state.circles[c]!.name, member_count: this.circleMemberIds(c).length })) : null,
        seen_count: mine ? this.state.seen.filter((s) => s.post === p.id && reach.has(s.user)).length : null,
        reach_count: mine ? reach.size : null,
        reply_scope: this.replyScope(me, p),
        taken_at: p.taken_at ?? null,
        ...this.postEvent(me, p),
      };
  }

  /** private.post_event (0013, EVT-1): the first live event on the post's audience, only for a parent or a member
   *  of that event; anyone else gets nulls (they never learn it exists). The fake doesn't model share-history cutoffs. */
  private postEvent(me: string, p: PostRow): { event_id: string | null; event_name: string | null } {
    const e = Object.values(this.state.circles).find((c) => c.kind === 'event' && !c.deleted && p.circles.includes(c.id)
      && (this.isPoster(p.space, me) || this.inCircle(c.id, me)));
    return { event_id: e?.id ?? null, event_name: e?.name ?? null };
  }

  createPost(user: string | null, a: CreatePostArgs): string {
    const me = this.requireUser(user);
    if ((a.batchId == null) !== (a.batchSize == null)) throw new ApiError('23514', 'batch id and size go together');
    if (a.batchSize != null && (a.batchSize < 1 || a.batchSize > 100)) throw new ApiError('23514', 'a batch is 1 to 100 posts');
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
      taken_at: a.takenAt ? new Date(a.takenAt).toISOString() : null, batch_id: a.batchId ?? null, batch_size: a.batchSize ?? null,
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
    return { i_hearted: i < 0, heart_count: this.state.hearts.filter((h) => h.post === post && this.canSeeReply(me, p, h.user)).length };
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
    return Object.values(this.state.comments).filter((c) => c.post === post && this.canSeeReply(me, p!, c.author))
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

  /** Same as request_account_deletion: out of every space (a sole owner keeps the space), content hidden. */
  requestAccountDeletion(user: string | null): void {
    const me = this.requireUser(user);
    for (const c of Object.values(this.state.comments)) if (c.author === me) delete this.state.comments[c.id];
    this.state.hearts = this.state.hearts.filter((h) => h.user !== me);
    for (const t of Object.keys(this.state.pushTokens ?? {})) if (this.state.pushTokens![t]!.user === me) delete this.state.pushTokens![t];
    this.state.members = this.state.members.filter((m) => m.user !== me
      || (m.role === 'owner' && !this.state.members.some((o) => o.space === m.space && o.role === 'owner' && o.user !== me)));
    this.state.circleMembers = this.state.circleMembers.filter((cm) => cm.user !== me);
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
    // UX-G7: refused like redeem, naming the inviter
    if (!this.invitePlaces(inv)) throw new ApiError('22023', 'invalid invite', this.state.users[inv.created_by]?.name);
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
    if (!this.invitePlaces(inv)) throw new ApiError('22023', 'invalid invite');
    inv.uses += 1;
    this.state.members.push({ space: inv.space, user: me, role: inv.role, invited_by: inv.created_by });
    const u = this.state.users[me];
    if (u && inv.name && u.nameSet === false) { u.name = inv.name; u.nameSet = true; } // JOIN-1
    // PRIV-G2 / GRP-12: Everyone only if named, or (an invite made before 0013) a household is named
    const places = [...inv.circles];
    const everyone = Object.values(this.state.circles).find((c) => c.space === inv.space && c.kind === 'everyone' && !c.deleted);
    if (everyone && inv.householdMeansEveryone && inv.circles.some((c) => this.state.circles[c]?.kind === 'household')) places.push(everyone.id);
    for (const c of places) if (!this.inCircle(c, me)) this.state.circleMembers.push({ circle: c, user: me, at: new Date().toISOString() });
    this.changed();
    return inv.space;
  }

  createInvite(user: string | null, a: CreateInviteArgs): { code: string; link: string } {
    const me = this.requireUser(user);
    if (!this.isPoster(a.space, me)) throw new ApiError('42501', 'only posters invite');
    if (a.role !== 'viewer' && this.member(a.space, me)?.role !== 'owner') throw new ApiError('42501', 'only owners invite adults');
    if (!a.circleIds.length) throw new ApiError('23514', 'at least one circle');
    if (a.circleIds.some((c) => this.state.circles[c]?.space !== a.space)) throw new ApiError('23514', 'circle not in space');
    // BETA-AUD-19: a relative's invite says whether they see past photos. GRP-12 (0013): it may name several groups.
    if (a.role === 'viewer' && (a.history !== 'all' && a.history !== 'new')) throw new ApiError('23514', 'choose all or new for past photos');
    if (a.name != null && !validName(a.name)) throw new ApiError('23514', 'a name is 1-40 characters, not an email address');
    if (a.name != null && this.state.members.some((m) => m.space === a.space && this.state.users[m.user]?.name.toLowerCase() === a.name!.trim().toLowerCase())) {
      throw new ApiError('23514', 'someone in this family already has that name'); // no impersonation, like the SQL
    }
    const bytes = randomBytes(10);
    const code = Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
    const days = Math.min(30, a.ttlDays ?? 30);
    this.state.invites[code] = {
      code, space: a.space, role: a.role, circles: [...a.circleIds], created_by: me, target_email: a.targetEmail?.toLowerCase() ?? null,
      expires_at: new Date(Date.now() + days * 864e5).toISOString(), max_uses: a.maxUses ?? 1, uses: 0, revoked: false,
      name: a.name?.trim() || null, history: a.role === 'viewer' ? a.history ?? null : null, householdMeansEveryone: false,
    };
    this.changed();
    return { code, link: JOIN_LINK_BASE + code };
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

  // ---------------- groups v2 (0013) ----------------
  /** private.managed_circle: live, and in a family the caller is a parent of; else "not found". */
  managedCircle(user: string | null, circle: string): CircleRow {
    const me = this.requireUser(user);
    const c = this.state.circles[circle];
    if (!c || c.deleted || !this.isPoster(c.space, me)) throw new ApiError('P0002', 'not found');
    return c;
  }
  historyChoice(h: unknown): void {
    if (h !== 'all' && h !== 'new') throw new ApiError('23514', 'choose "all" or "new" for past photos');
  }

  createLevel(user: string | null, space: string, kind: string, name: string): string {
    const me = this.requireUser(user);
    if (!this.isPoster(space, me)) throw new ApiError('P0002', 'not found');
    if (kind !== 'group' && kind !== 'household' && kind !== 'event') throw new ApiError('23514', 'kind');
    const n = (name ?? '').trim();
    if (n.length < 1 || n.length > 60) throw new ApiError('23514', 'name length');
    if (Object.values(this.state.circles).some((o) => o.space === space && o.name === n)) throw new ApiError('23514', 'name taken');
    const id = uuid();
    this.state.circles[id] = { id, space, name: n, created_by: me, deleted: false, kind, comment_mode: defaultMode(kind) };
    this.changed();
    return id;
  }

  setCommentMode(user: string | null, circle: string, mode: CommentMode): void {
    const c = this.managedCircle(user, circle);
    if (c.kind === 'everyone') throw new ApiError('23514', "Everyone's setting stays Private");
    if (!MODES.includes(mode)) throw new ApiError('23514', 'comment setting');
    c.comment_mode = mode;
    this.changed();
  }

  /** The fake keeps one membership list, so placing a person is adding them (history is checked, not modelled). */
  placePerson(user: string | null, group: string, person: string, history: ShareHistory): void {
    const c = this.managedCircle(user, group);
    this.historyChoice(history);
    if (c.kind === 'everyone') throw new ApiError('23514', 'people join Everyone through an invite');
    if (!this.member(c.space, person)) throw new ApiError('23514', 'not a member of this family');
    if (!this.inCircle(group, person)) this.state.circleMembers.push({ circle: group, user: person, at: new Date().toISOString() });
    this.changed();
  }

  addPeopleFrom(user: string | null, target: string, source: string, history: ShareHistory): void {
    const t = this.managedCircle(user, target);
    const s = this.managedCircle(user, source);
    this.historyChoice(history);
    if (t.space !== s.space) throw new ApiError('23514', 'both must be in the same family');
    if (t.kind === 'everyone') throw new ApiError('23514', 'people join Everyone through an invite');
    for (const u of this.circleMemberIds(source)) {
      if (this.member(t.space, u)?.role === 'viewer' && !this.inCircle(target, u)) this.state.circleMembers.push({ circle: target, user: u, at: new Date().toISOString() });
    }
    this.changed();
  }

  /** space_members + profiles under RLS: parents see everyone; others themselves and the parents. */
  familyPeople(user: string | null, space: string): Person[] {
    const me = this.requireUser(user);
    const parent = this.isPoster(space, me);
    return this.state.members
      .filter((m) => m.space === space && (parent || m.user === me || m.role === 'owner' || m.role === 'adult'))
      .filter(() => !!this.member(space, me))
      .map((m) => ({ user_id: m.user, name: this.state.users[m.user]?.name ?? '?', role: m.role }));
  }

  /** private.feature_on for each known feature: global switch AND family switch AND can(capability); a missing row is the default. */
  myFeatures(user: string | null, space: string): string[] {
    const me = this.requireUser(user);
    return Object.keys(FEATURE_CAPABILITY).filter((f) => {
      const def = FEATURE_DEFAULT_ON.has(f);
      return (this.state.featureFlags?.[f] ?? def) && (this.state.spaceFeatures?.[`${space}:${f}`] ?? def) && this.isPoster(space, me);
    }).sort();
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
    if (this.be.ready) await this.be.ready;
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
  getTimeline = (a: TimelineArgs) => this.run(() => this.be.getTimeline(this.userId, a));
  getTimelineYears = (space: string, tz?: string) => this.run(() => this.be.getTimelineYears(this.userId, space, tz));
  createPost = (a: CreatePostArgs) => this.run(() => this.be.createPost(this.userId, a));
  publishPost = (p: string) => this.run(() => this.be.publishPost(this.userId, p));
  deletePost = (p: string) => this.run(() => this.be.deletePost(this.userId, p));
  toggleHeart = (p: string) => this.run(() => this.be.toggleHeart(this.userId, p));
  addComment = (a: AddCommentArgs) => this.run(() => this.be.addComment(this.userId, a));
  getComments = (p: string, limit?: number) => this.run(() => this.be.getComments(this.userId, p, limit));
  markSeen = (p: string) => this.run(() => this.be.markSeen(this.userId, p));
  registerPushToken = (t: string, platform: PushPlatform) => this.run(() => this.be.registerPushToken(this.userId, t, platform));
  reportClientError = (r: ClientErrorReport) => this.run(() => this.be.reportClientError(r));
  replyReaders = (p: string) => this.run(() => this.be.replyReaders(this.userId, p));
  setReplyAudience = (s: string, choice: ReplyAudience) => this.run(() => this.be.setReplyAudience(this.userId, s, choice));
  requestAccountDeletion = () => this.run(() => this.be.requestAccountDeletion(this.userId));
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
    if (this.be.ready) await this.be.ready;
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    return this.be.getObject(url).slice();
  };
  renameCircle = (c: string, name: string) => this.run(() => this.be.renameCircle(this.userId, c, name));
  createLevel = (space: string, kind: Exclude<CircleKind, 'everyone'>, name: string) => this.run(() => this.be.createLevel(this.userId, space, kind, name));
  setCommentMode = (c: string, mode: CommentMode) => this.run(() => this.be.setCommentMode(this.userId, c, mode));
  placePerson = (g: string, u: string, h: ShareHistory) => this.run(() => this.be.placePerson(this.userId, g, u, h));
  addPeopleFrom = (t: string, f: string, h: ShareHistory) => this.run(() => this.be.addPeopleFrom(this.userId, t, f, h));
  familyPeople = (space: string) => this.run(() => this.be.familyPeople(this.userId, space));
  myFeatures = (space: string) => this.run(() => this.be.myFeatures(this.userId, space));
  chatList = (space: string) => this.run(() => this.be.chatList(this.userId, space));
  chatPublishDevice = (k: string, kps: string[]) => this.run(() => this.be.chatPublishDevice(this.userId, k, kps));
  chatKeyPackageCount = () => this.run(() => this.be.chatKeyPackageCount(this.userId));
  chatStart = (c: string) => this.run(() => this.be.chatStart(this.userId, c));
  chatRoster = (c: string) => this.run(() => this.be.chatRoster(this.userId, c));
  chatClaim = (c: string, users: string[]) => this.run(() => this.be.chatClaim(this.userId, c, users));
  chatSend = (c: string, kind: ChatRowKind, epoch: number, body: string, recipient?: string) =>
    this.run(() => this.be.chatSend(this.userId, c, kind, epoch, body, recipient));
  chatFetch = (c: string, after: number, limit?: number) => this.run(() => this.be.chatFetch(this.userId, c, after, limit));
}
