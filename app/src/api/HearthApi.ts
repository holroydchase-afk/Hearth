import type {
  NotificationPrefs,
  PushPlatform,
  AddCommentArgs, Circle, CommentRow, CreateInviteArgs, CreatePostArgs, FeedArgs, FeedPost,
  FinalizeResult, HeartState, InvitePreview, Session, Space, UploadGrant, UploadItemSpec, ViewGrant,
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
  | '54000' // rate limited
  | 'BAD_OTP' // wrong or old 6-digit sign-in code
  | 'EXIF' // sign-media 422: metadata not stripped
  | 'VIDEO_CAP' // sign-media 402
  | 'VIDEO_TOO_LONG' // pipeline: > 60 s
  | 'AUTH' // not signed in / session expired
  | 'NETWORK' // no connection, timeout, 5xx
  | 'UNKNOWN';

export class ApiError extends Error {
  constructor(public readonly code: ApiErrorCode, message?: string) {
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

  // --- NOT in API.md (flagged in README): basic group rename for the Groups screen ---
  renameCircle(circle: string, name: string): Promise<void>;
}
