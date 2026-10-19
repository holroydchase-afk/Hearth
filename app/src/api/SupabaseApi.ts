// HearthApi over supabase-js (PostgREST RPCs) + the sign-media edge function.
// Privacy: nothing here logs keys, URLs or captions.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, type ApiErrorCode, type HearthApi } from './HearthApi';
import type {
  ReplyAudience,
  CircleKind, CommentMode, Person, Role, ShareHistory,
  ClientErrorReport,
  MyProfile,
  NotificationPrefs,
  PushPlatform,
  AddCommentArgs, Circle, CommentRow, CreateInviteArgs, CreatePostArgs, FeedArgs, FeedPost, FinalizeResult,
  HeartState, InvitePreview, Session, Space, UploadGrant, UploadItemSpec, ViewGrant,
  TimelineArgs, TimelinePost, TimelineYear,
  ChatMember, ChatRow, ChatRowKind, ChatSummary, ClaimedKeyPackage,
} from './types';
import { toApiError } from '../errors/messages';
import { JOIN_LINK_BASE } from './links';

export { JOIN_LINK_BASE };

export interface SupabaseApiOptions {
  url: string;
  anonKey: string;
  client: SupabaseClient;
  /** Override for contract tests that inject a JWT directly. Defaults to the client's session. */
  accessToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

const one = <T>(d: unknown): T => (Array.isArray(d) ? d[0] : d) as T;

const HTTP_CODES: Record<number, ApiErrorCode> = { 400: '23514', 401: 'AUTH', 402: 'VIDEO_CAP', 403: '42501', 404: 'P0002', 422: 'EXIF', 429: '54000' };

export class SupabaseApi implements HearthApi {
  private readonly fn: string;
  private readonly fetch: typeof fetch;
  constructor(private o: SupabaseApiOptions) {
    this.fn = `${o.url.replace(/\/$/, '')}/functions/v1/sign-media`;
    this.fetch = o.fetchImpl ?? ((...a) => fetch(...a));
  }

  private async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    let res: { data: unknown; error: unknown };
    try {
      res = (await this.o.client.rpc(name, args)) as { data: unknown; error: unknown };
    } catch (e) {
      throw toApiError(e);
    }
    if (res.error) throw toApiError(res.error);
    return res.data as T;
  }

  private async token(): Promise<string | null> {
    if (this.o.accessToken) return this.o.accessToken();
    const { data } = await this.o.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  private async fnCall<T>(method: 'GET' | 'POST', query: string, body?: unknown): Promise<T> {
    const tok = await this.token();
    if (!tok) throw new ApiError('AUTH');
    let r: Response;
    try {
      r = await this.fetch(this.fn + query, {
        method,
        headers: { authorization: `Bearer ${tok}`, apikey: this.o.anonKey, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (e) {
      throw toApiError(e);
    }
    if (!r.ok) throw new ApiError(HTTP_CODES[r.status] ?? 'NETWORK');
    return (await r.json()) as T;
  }

  // ---- auth ----
  async getSession(): Promise<Session | null> {
    const { data } = await this.o.client.auth.getSession();
    const u = data.session?.user;
    return u ? { userId: u.id, email: u.email ?? '' } : null;
  }
  async sendCode(email: string): Promise<void> {
    // With the Supabase email template set to {{ .Token }}, this sends a 6-digit code (no link).
    const { error } = await this.o.client.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    if (error) {
      if ((error as { status?: number }).status === 429) throw new ApiError('54000');
      throw toApiError(error);
    }
  }
  async verifyCode(email: string, code: string): Promise<Session> {
    const { data, error } = await this.o.client.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    if (error || !data.session) {
      const status = (error as { status?: number } | null)?.status;
      if (status === 429) throw new ApiError('54000');
      if (error && /fetch|network/i.test(error.message)) throw new ApiError('NETWORK');
      throw new ApiError('BAD_OTP');
    }
    return { userId: data.session.user.id, email: data.session.user.email ?? email };
  }
  async signOut(): Promise<void> {
    await this.o.client.auth.signOut();
  }

  // ---- RPCs ----
  mySpaces = () => this.rpc<Space[]>('my_spaces').then((d) => d ?? []);
  myCircles = (space: string) => this.rpc<Circle[]>('my_circles', { p_space: space }).then((d) => d ?? []);
  getFeed = (a: FeedArgs) =>
    this.rpc<FeedPost[]>('get_feed', {
      p_space: a.space, p_before_ts: a.beforeTs ?? null, p_before_id: a.beforeId ?? null,
      p_limit: Math.max(1, Math.min(50, a.limit ?? 20)),
    }).then((d) => d ?? []);
  getTimeline = (a: TimelineArgs) =>
    this.rpc<TimelinePost[]>('get_timeline', {
      p_space: a.space, p_before_at: a.beforeAt ?? null, p_before_id: a.beforeId ?? null,
      p_limit: Math.max(1, Math.min(50, a.limit ?? 20)),
    }).then((d) => d ?? []);
  getTimelineYears = (space: string, tz?: string) =>
    this.rpc<TimelineYear[]>('get_timeline_years', { p_space: space, p_tz: tz ?? 'UTC' }).then((d) => d ?? []);
  // Batch args only when set, so an ordinary post still matches a pre-0010 create_post.
  createPost = (a: CreatePostArgs) =>
    this.rpc<string>('create_post', {
      p_client_id: a.clientId, p_space: a.space, p_caption: a.caption, p_circle_ids: a.circleIds, p_taken_at: a.takenAt ?? null,
      ...(a.batchId != null || a.batchSize != null ? { p_batch_id: a.batchId ?? null, p_batch_size: a.batchSize ?? null } : {}),
    });
  publishPost = (p: string) => this.rpc<void>('publish_post', { p_post: p });
  deletePost = (p: string) => this.rpc<void>('delete_post', { p_post: p });
  toggleHeart = (p: string) => this.rpc<unknown>('toggle_heart', { p_post: p }).then((d) => one<HeartState>(d));
  addComment = (a: AddCommentArgs) =>
    this.rpc<unknown>('add_comment', { p_client_id: a.clientId, p_post: a.post, p_body: a.body }).then((d) => one<{ comment_id: string; created_at: string }>(d));
  getComments = (p: string, limit = 50) => this.rpc<CommentRow[]>('get_comments', { p_post: p, p_limit: limit }).then((d) => d ?? []);
  markSeen = (p: string) => this.rpc<void>('mark_seen', { p_post: p });
  registerPushToken = (token: string, platform: PushPlatform) =>
    this.rpc<void>('register_push_token', { p_token: token, p_platform: platform });
  replyReaders = (post: string) => this.rpc<string[] | null>('reply_readers', { p_post: post }).then((d) => d ?? null);
  setReplyAudience = (space: string, choice: ReplyAudience) => this.rpc<void>('set_reply_audience', { p_space: space, p_choice: choice });
  requestAccountDeletion = () => this.rpc<void>('request_account_deletion', {});
  myProfile = () => this.rpc<unknown>('my_profile', {}).then((d) => one<MyProfile>(d));
  setMyName = (name: string) => this.rpc<void>('set_my_name', { p_name: name });
  reportClientError = (r: ClientErrorReport) =>
    this.rpc<void>('report_client_error', { p_app_version: r.appVersion, p_os: r.os, p_screen: r.screen, p_kind: r.kind, p_code: r.code ?? null });
  setNotificationPrefs = (space: string, p: NotificationPrefs) =>
    this.rpc<void>('set_notification_prefs', { p_space: space, p_push: p.push, p_email_digest: p.emailDigest });
  redeemInvite = (code: string) => this.rpc<string>('redeem_invite', { p_code: code });
  invitePreview = async (code: string): Promise<InvitePreview> => {
    let res: { data: unknown; error: unknown };
    try {
      res = (await this.o.client.rpc('invite_preview', { p_code: code })) as { data: unknown; error: unknown };
    } catch (e) {
      throw toApiError(e);
    }
    if (res.error) {
      const e = toApiError(res.error);
      // UX-G7: a real invite that no longer places anyone names the inviter in details. Only here: details from
      // any other RPC may hold server text and is never shown.
      const d = (res.error as { details?: unknown }).details;
      throw e.code === '22023' && typeof d === 'string' && d.trim() ? new ApiError('22023', e.message, d.trim()) : e;
    }
    const r = one<InvitePreview>(res.data);
    return { inviter_name: r.inviter_name, space_name: r.space_name };
  };
  createInvite = async (a: CreateInviteArgs) => {
    const d = await this.rpc<unknown>('create_invite', {
      p_space: a.space, p_role: a.role, p_circle_ids: a.circleIds, p_channel: a.channel ?? 'link',
      p_target_email: a.targetEmail ?? null, p_target_phone: a.targetPhone ?? null,
      p_ttl: `${Math.min(30, a.ttlDays ?? 30)} days`, p_max_uses: a.maxUses ?? 1, p_name: a.name ?? null,
      p_history: a.history ?? null,
    });
    const r = one<{ code: string; link?: string }>(d);
    return { code: r.code, link: r.link ?? JOIN_LINK_BASE + r.code };
  };
  renameCircle = (circle: string, name: string) => this.rpc<void>('rename_circle', { p_circle: circle, p_name: name });
  // ---- groups v2 (0013) ----
  createLevel = (space: string, kind: Exclude<CircleKind, 'everyone'>, name: string) =>
    this.rpc<unknown>('create_level', { p_space: space, p_kind: kind, p_name: name }).then((d) => one<string>(d));
  setCommentMode = (circle: string, mode: CommentMode) => this.rpc<void>('set_comment_mode', { p_circle: circle, p_mode: mode });
  placePerson = (group: string, user: string, history: ShareHistory) =>
    this.rpc<void>('place_person', { p_group: group, p_user: user, p_history: history });
  addPeopleFrom = (target: string, source: string, history: ShareHistory) =>
    this.rpc<void>('add_people_from', { p_target: target, p_source: source, p_history: history });
  myFeatures = (space: string) =>
    this.rpc<{ feature: string }[] | null>('my_features', { p_space: space }).then((d) => (d ?? []).map((r) => r.feature));
  /** Two plain reads under RLS (space_members: parents see the whole family; profiles: can_see_profile). Only names
   *  and roles are selected: never an email. */
  familyPeople = async (space: string): Promise<Person[]> => {
    let members: { data: unknown; error: unknown };
    try {
      members = (await this.o.client.from('space_members').select('user_id, role').eq('space_id', space)) as { data: unknown; error: unknown };
    } catch (e) {
      throw toApiError(e);
    }
    if (members.error) throw toApiError(members.error);
    const rows = (members.data ?? []) as { user_id: string; role: Role }[];
    if (!rows.length) return [];
    let profiles: { data: unknown; error: unknown };
    try {
      profiles = (await this.o.client.from('profiles').select('id, display_name').in('id', rows.map((r) => r.user_id))) as { data: unknown; error: unknown };
    } catch (e) {
      throw toApiError(e);
    }
    if (profiles.error) throw toApiError(profiles.error);
    const names = new Map(((profiles.data ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
    return rows.filter((r) => names.has(r.user_id)).map((r) => ({ user_id: r.user_id, name: names.get(r.user_id)!, role: r.role }));
  };

  // ---- messenger relay (0015) ----
  chatList = (space: string) => this.rpc<ChatSummary[]>('chat_list', { p_space: space }).then((r) => r ?? []);
  chatPublishDevice = (signatureKey: string, keyPackages: string[]) =>
    this.rpc<void>('chat_publish_device', { p_signature_key: signatureKey, p_key_packages: keyPackages });
  chatKeyPackageCount = () => this.rpc<number>('chat_key_package_count');
  chatStart = (circle: string) => this.rpc<boolean>('chat_start', { p_circle: circle });
  chatRoster = (circle: string) => this.rpc<ChatMember[]>('chat_roster', { p_circle: circle }).then((r) => r ?? []);
  chatClaim = (circle: string, users: string[]) =>
    this.rpc<ClaimedKeyPackage[]>('chat_claim', { p_circle: circle, p_users: users }).then((r) => r ?? []);
  chatSend = (circle: string, kind: ChatRowKind, epoch: number, body: string, recipient?: string) =>
    this.rpc<number>('chat_send', { p_circle: circle, p_kind: kind, p_epoch: epoch, p_body: body, p_recipient: recipient ?? null }).then(Number);
  chatFetch = (circle: string, after: number, limit = 200) =>
    this.rpc<ChatRow[]>('chat_fetch', { p_circle: circle, p_after: after, p_limit: limit })
      .then((r) => (r ?? []).map((x) => ({ ...x, id: Number(x.id), epoch: Number(x.epoch) })));

  // ---- sign-media ----
  signUpload = (post: string, items: UploadItemSpec[]) => this.fnCall<UploadGrant>('POST', '', { action: 'upload', post_id: post, items });
  finalizeMedia = (ids: string[]) => this.fnCall<{ results: FinalizeResult[] }>('POST', '', { action: 'finalize', media_ids: ids }).then((r) => r.results ?? []);
  signView = (post: string) => this.fnCall<ViewGrant>('GET', `?post_id=${encodeURIComponent(post)}`);
  putObject = async (url: string, bytes: Uint8Array, headers: Record<string, string>) => {
    let r: Response;
    try {
      r = await this.fetch(url, { method: 'PUT', headers, body: bytes as unknown as BodyInit });
    } catch (e) {
      throw toApiError(e);
    }
    if (!r.ok) throw new ApiError(r.status === 403 ? 'NETWORK' : HTTP_CODES[r.status] ?? 'NETWORK'); // 403 = URL expired: retry re-signs
  };
  getObject = async (url: string) => {
    let r: Response;
    try {
      r = await this.fetch(url, { method: 'GET' });
    } catch (e) {
      throw toApiError(e);
    }
    if (!r.ok) throw new ApiError(r.status === 404 ? 'P0002' : 'NETWORK');
    return new Uint8Array(await r.arrayBuffer());
  };
}
