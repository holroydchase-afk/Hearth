// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Row shapes from API.md (v1, beta). snake_case on purpose: these are the wire shapes.

export type Role = 'owner' | 'adult' | 'viewer';

export interface Space {
  space_id: string;
  name: string;
  role: Role;
  inviter_name: string | null;
  can_post: boolean;
  /** AUD-10: who reads relatives' replies: only the parents (default), or everyone the post went to. */
  reply_audience?: ReplyAudience;
}

export type ReplyAudience = 'parents' | 'everyone';
/** AUD-8 / REPLY-7: who will read MY replies on this post ('group' = my household or event too). */
export type ReplyScope = 'parents' | 'group' | 'everyone';

/** 0011 (SPEC-GROUPS): every container is a "group" in the app's words; kind says which part of the family shape. */
export type CircleKind = 'everyone' | 'group' | 'household' | 'event';

/** SPEC-GROUPS v2 (0013): who reads a member's comments, besides the writer, the parents and the poster.
 *  App words: Private / Shared on this group's photos / Always shared. Parents only; relatives never get it. */
export type CommentMode = 'private' | 'on_group_posts' | 'always';

/** A person in the family (space_members + profiles, parents read it through RLS). */
export interface Person {
  user_id: string;
  name: string;
  role: Role;
}

/** BETA-AUD-19: when someone is added, do they see photos already shared? No default. */
export type ShareHistory = 'all' | 'new';

export interface Circle {
  circle_id: string;
  name: string;
  member_count: number;
  member_names: string[];
  /** 0011. Older servers omit it (treat as 'group'). */
  kind?: CircleKind;
  /** 0011: the groups and events this one sits under. */
  parent_ids?: string[];
  /** 0013 (GRP-13): parents only; older servers omit it. */
  comment_mode?: CommentMode;
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
  /** Every reaction you may see (0017: Love, Haha and Like all count). */
  heart_count: number;
  /** You reacted, with any of the three. */
  i_hearted: boolean;
  /** REACT (0017): filled in by reaction_summary after the page loads; absent on an older server. */
  my_reaction?: Reaction | null;
  reaction_counts?: ReactionCounts;
  comment_count: number;
  /** Non-null only for the author. */
  audience: AudienceCircle[] | null;
  seen_count: number | null;
  reach_count: number | null;
  /** AUD-8/9: who will read the caller's replies on this post. */
  reply_scope?: ReplyScope;
  /** 0010 (BETA-TIME-1): when it was taken, read on the phone; null if unknown. Older servers omit it. */
  taken_at?: string | null;
  /** 0013 (EVT-1): the event the post was sent to, only for that event's members and the parents; else null.
   *  Older servers omit it. */
  event_id?: string | null;
  event_name?: string | null;
  /** 0019 (CAP-3): the set's optional title, 80 characters at most. Older servers omit it. */
  title?: string | null;
  /** 0021 (CAP-6): when the sender last changed the words; null if never. Older servers omit it. */
  words_edited_at?: string | null;
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
  /** Capture time read on the phone (BETA-BULK-1). Only this date leaves the phone, never EXIF/GPS. */
  takenAt?: string | null;
  /** BETA-BULK-6: posts from one bulk pick share a batch id; size = number of posts in the batch (1-100). Both or neither. */
  batchId?: string | null;
  batchSize?: number | null;
  /** 0019 (CAP-1): optional title for the whole set, 80 characters at most; blank means none. */
  title?: string | null;
}

/** get_timeline (migration 0010, BETA-TIME-2): keyset on (sort_at, post_id). */
export interface TimelineArgs {
  space: string;
  beforeAt?: string | null;
  beforeId?: string | null;
  limit?: number;
}

/** A feed row plus when it was taken. sort_at = coalesce(taken_at, published_at). */
export interface TimelinePost extends FeedPost {
  taken_at: string | null;
  sort_at: string;
}

/** get_timeline_years (BETA-TIME-4 "Jump to year"): only posts the caller can see are counted. */
export interface TimelineYear {
  year: number;
  post_count: number;
  photo_count: number;
}

export interface HeartState {
  i_hearted: boolean;
  heart_count: number;
}

/** REACT-1 (0017): the three reactions, in the order the card shows them. */
export const REACTIONS = ['❤️', '😂', '👍'] as const;
export type Reaction = (typeof REACTIONS)[number];
export type ReactionCounts = Partial<Record<Reaction, number>>;

export interface ReactionState {
  my_reaction: Reaction | null;
  heart_count: number;
  counts: ReactionCounts;
}

export interface ReactionSummary {
  post_id: string;
  my_reaction: Reaction | null;
  counts: ReactionCounts;
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
  /** What the family calls the invitee ("Grandma June"); becomes their name on joining (JOIN-1). */
  name?: string | null;
  /** BETA-AUD-19 (0011): required for a relative ('viewer'); the server refuses the invite without it (23514). */
  history?: ShareHistory | null;
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

/** register_push_token (AE-2). */
export type PushPlatform = 'ios' | 'android' | 'web';

/** set_notification_prefs (AE-2): per space. Push on with no phone registered falls back to a daily email. */
export interface NotificationPrefs {
  push: boolean;
  emailDigest: 'off' | 'daily' | 'weekly';
}

/** report_client_error (BETA-OPS-1): fixed fields only; never a caption, email, URL or key. */
export interface ClientErrorReport {
  appVersion: string;
  os: string;
  screen: string;
  kind: string;
  code?: string;
}

/** my_profile (BETA-NOTIFY-7): name_set is false while the name is only an email-prefix placeholder. */
export interface MyProfile {
  user_id: string;
  display_name: string;
  name_set: boolean;
}

/** Messenger (SPEC-MESSENGER, 0015). The server relays opaque MLS bytes as base64; it never sees plaintext. */
export type ChatKind = 'group' | 'event' | 'everyone';
/** chat_list: a relative's plain-group chat is titled by its people, never the group's name (AUD-14). */
/** named: the title is the group's or event's own name (parents, events, Everyone); false: it lists the people. */
export interface ChatSummary { circle_id: string; kind: ChatKind; title: string; named: boolean; member_count: number }
/** chat_roster: signature_key is the person's phone's public MLS signing key (null until they open Messages). */
export interface ChatMember { user_id: string; name: string; signature_key: string | null }
export type ChatRowKind = 'commit' | 'welcome' | 'message';
export interface ChatRow { id: number; sender_id: string | null; kind: ChatRowKind; epoch: number; body: string; created_at: string }
export interface ClaimedKeyPackage { user_id: string; key_package: string }
