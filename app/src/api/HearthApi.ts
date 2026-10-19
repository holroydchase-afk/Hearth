import type {
  ReplyAudience,
  CircleKind, CommentMode, Person, ShareHistory,
  MyProfile,
  ClientErrorReport,
  NotificationPrefs,
  PushPlatform,
  AddCommentArgs, Circle, CommentRow, CreateInviteArgs, CreatePostArgs, FeedArgs, FeedPost,
  FinalizeResult, HeartState, InvitePreview, Session, Space, UploadGrant, UploadItemSpec, ViewGrant,
  TimelineArgs, TimelinePost, TimelineYear,
  ChatMember, ChatRow, ChatRowKind, ChatSummary, ClaimedKeyPackage,
} from './types';

export * from './types';

/**
 * Error codes: the PostgREST codes from API.md, plus a few app-side codes for things
 * that are not database errors (network down, wrong sign-in code, sign-media HTTP statuses).
 */
export type ApiErrorCode =
  | '23514' // rule violated
  | '42501' // not allowed
  | 'P0002' // not found or not visible
  | '22023' // invalid invite or code
  | '23505' // already taken (MSG-5: another phone changed the chat's keys first)
  | '54000' // rate limited
  | 'BAD_OTP' // wrong or old 6-digit sign-in code
  | 'EXIF' // sign-media 422: metadata not stripped
  | 'VIDEO_CAP' // sign-media 402
  | 'VIDEO_TOO_LONG' // pipeline: > 60 s
  | 'AUTH' // not signed in / session expired
  | 'NETWORK' // no connection, timeout, 5xx
  | 'UNKNOWN';

export class ApiError extends Error {
  /** UX-G7: only invite_preview's 22023 sets this (the inviter's name, for "Ask Chase for a new one."). */
  constructor(public readonly code: ApiErrorCode, message?: string, public readonly inviter?: string) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Errors worth retrying later (the upload queue keeps waiting on these). */
export const isRetryable = (e: unknown): boolean =>
  !isApiError(e) || e.code === 'NETWORK' || e.code === 'UNKNOWN' || e.code === '54000';

/**
 * Mirrors API.md. Every method maps 1:1 to an RPC or a sign-media call, except the auth
 * helpers (Supabase Auth email OTP) and the byte transfer helpers (presigned URLs).
 */
export interface HearthApi {
  // --- auth (Supabase Auth, email 6-digit code; no passwords, no magic links) ---
  getSession(): Promise<Session | null>;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<Session>;
  signOut(): Promise<void>;

  // --- RPCs ---
  mySpaces(): Promise<Space[]>;
  myCircles(space: string): Promise<Circle[]>;
  getFeed(args: FeedArgs): Promise<FeedPost[]>;
  /** BETA-TIME-2/3 (migration 0010): by date taken; same visibility as getFeed. */
  getTimeline(args: TimelineArgs): Promise<TimelinePost[]>;
  /** BETA-TIME-4 "Jump to year". timeZone = the phone's IANA zone. */
  getTimelineYears(space: string, timeZone?: string): Promise<TimelineYear[]>;
  createPost(args: CreatePostArgs): Promise<string>;
  publishPost(post: string): Promise<void>;
  deletePost(post: string): Promise<void>;
  toggleHeart(post: string): Promise<HeartState>;
  addComment(args: AddCommentArgs): Promise<{ comment_id: string; created_at: string }>;
  getComments(post: string, limit?: number): Promise<CommentRow[]>;
  markSeen(post: string): Promise<void>;
  redeemInvite(code: string): Promise<string>;
  /** Callable signed out (anon). */
  invitePreview(code: string): Promise<InvitePreview>;
  createInvite(args: CreateInviteArgs): Promise<{ code: string; link: string }>;

  // --- sign-media edge function ---
  signUpload(post: string, items: UploadItemSpec[]): Promise<UploadGrant>;
  putObject(url: string, bytes: Uint8Array, headers: Record<string, string>): Promise<void>;
  finalizeMedia(mediaIds: string[]): Promise<FinalizeResult[]>;
  signView(post: string): Promise<ViewGrant>;
  getObject(url: string): Promise<Uint8Array>;

  // --- notifications (AE-2) ---
  registerPushToken(token: string, platform: PushPlatform): Promise<void>;
  setNotificationPrefs(space: string, prefs: NotificationPrefs): Promise<void>;

  // --- who reads replies (BETA-AUD-10, REPLY-11; the AUD-9 group switch is gone in 0011) ---
  setReplyAudience(space: string, choice: ReplyAudience): Promise<void>;
  /** REPLY-11: the names of everyone who will read the caller's reply on this post; null = not found. */
  replyReaders(post: string): Promise<string[] | null>;

  // --- account deletion (BETA-JOIN-7) ---
  requestAccountDeletion(): Promise<void>;

  // --- names (BETA-NOTIFY-7, JOIN-1) ---
  myProfile(): Promise<MyProfile>;
  setMyName(name: string): Promise<void>;

  // --- our own error reports (BETA-OPS-1); callable signed out ---
  reportClientError(r: ClientErrorReport): Promise<void>;

  // --- rename_circle (API.md) ---
  renameCircle(circle: string, name: string): Promise<void>;

  // --- groups v2 (SPEC-GROUPS v2, migration 0013; parents only, relatives get P0002) ---
  /** create_level: a group starts Private, an event Shared on this group's photos. Returns the new id. */
  createLevel(space: string, kind: Exclude<CircleKind, 'everyone'>, name: string): Promise<string>;
  /** set_comment_mode (GRP-9/17). Everyone or an unknown value: 23514. */
  setCommentMode(circle: string, mode: CommentMode): Promise<void>;
  /** place_person (GRP-10): any live group; a share-history choice is required (23514). */
  placePerson(group: string, user: string, history: ShareHistory): Promise<void>;
  /** add_people_from (GRP-11): copies the relatives now in source into target, once (not linked). */
  addPeopleFrom(target: string, source: string, history: ShareHistory): Promise<void>;
  /** The family's people with ids (space_members + profiles under RLS): parents get everyone; a relative only
   *  herself and the parents. Only the Groups screen (parents) calls it. */
  familyPeople(space: string): Promise<Person[]>;
  /** my_features (FLAG-5): the features on for the caller in this family. Default none. */
  myFeatures(space: string): Promise<string[]>;

  // --- messenger relay (SPEC-MESSENGER, 0015): opaque base64 MLS bytes ---
  chatList(space: string): Promise<ChatSummary[]>;
  chatPublishDevice(signatureKey: string, keyPackages: string[]): Promise<void>;
  chatKeyPackageCount(): Promise<number>;
  chatStart(circle: string): Promise<boolean>;
  chatRoster(circle: string): Promise<ChatMember[]>;
  chatClaim(circle: string, users: string[]): Promise<ClaimedKeyPackage[]>;
  chatSend(circle: string, kind: ChatRowKind, epoch: number, body: string, recipient?: string): Promise<number>;
  chatFetch(circle: string, after: number, limit?: number): Promise<ChatRow[]>;
}
