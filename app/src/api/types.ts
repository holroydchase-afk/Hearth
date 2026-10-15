// Row shapes from API.md (v1, beta). snake_case on purpose: these are the wire shapes.

export type Role = 'owner' | 'adult' | 'viewer';

export interface Space {
  space_id: string;
  name: string;
  role: Role;
  inviter_name: string | null;
  can_post: boolean;
}

export interface Circle {
  circle_id: string;
  name: string;
  member_count: number;
  member_names: string[];
}

export type MediaKind = 'photo' | 'video';
export type MediaStatus = 'pending' | 'ready' | 'failed';

export interface FeedMedia {
  media_id: string;
  kind: MediaKind;
  width: number;
  height: number;
  duration_ms: number | null;
  status: MediaStatus;
}

export interface AudienceCircle {
  circle_id: string;
  name: string;
  member_count: number;
}

export interface FeedPost {
  post_id: string;
  author_id: string;
  author_name: string;
  caption: string | null;
  published_at: string;
  media: FeedMedia[];
  heart_count: number;
  i_hearted: boolean;
  comment_count: number;
  /** Non-null only for the author. */
  audience: AudienceCircle[] | null;
  seen_count: number | null;
  reach_count: number | null;
}

export interface FeedArgs {
  space: string;
  beforeTs?: string | null;
  beforeId?: string | null;
  limit?: number;
}

export interface CreatePostArgs {
  clientId: string;
  space: string;
  caption: string | null;
  circleIds: string[];
  takenAt?: string | null;
}

export interface HeartState {
  i_hearted: boolean;
  heart_count: number;
}

export interface AddCommentArgs {
  clientId: string;
  post: string;
  body: string;
}

export interface CommentRow {
  comment_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface InvitePreview {
  inviter_name: string;
  space_name: string;
}

export interface CreateInviteArgs {
  space: string;
  role: Role;
  circleIds: string[];
  channel?: 'link' | 'email' | 'sms';
  targetEmail?: string | null;
  targetPhone?: string | null;
  ttlDays?: number;
  maxUses?: number;
}

export interface Session {
  userId: string;
  email: string;
}

// ---- sign-media (shapes from backend/supabase/functions/sign-media/index.ts) ----

export interface UploadItemSpec {
  kind: MediaKind;
  mime_type: string;
  width: number;
  height: number;
  duration_ms?: number | null;
  /** Size of the ciphertext the client will PUT (finalize HEAD-checks it). */
  byte_size: number;
  thumb_byte_size: number;
  exif_stripped: boolean;
}

export interface UploadGrantItem {
  media_id: string;
  item_index: number;
  dek: string; // base64, 32 bytes
  enc_scheme: string;
  display_put_url: string;
  thumb_put_url: string;
  required_headers: Record<string, string>;
}

export interface UploadGrant {
  post_id: string;
  expires_in: number;
  items: UploadGrantItem[];
}

export interface FinalizeResult {
  media_id: string;
  ok: boolean;
}

export interface ViewGrantItem {
  id: string;
  position: number;
  kind: MediaKind;
  mime_type: string;
  width: number;
  height: number;
  duration_ms: number | null;
  byte_size: number;
  enc_scheme: string;
  dek: string;
  display_url: string;
  thumb_url: string;
}

export interface ViewGrant {
  post_id: string;
  expires_in: number;
  items: ViewGrantItem[];
}
