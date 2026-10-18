// SESS-1..2: a 1-hour session in Photos, display only. Computed on the phone from the posts this person can already
// see; nothing is sent or stored. Consecutive ordinary post rows by one sender, to the same groups (as this person's
// row shows them: the sender sees the groups, everyone else sees "Shared with you"), in the same event or none, each
// shared within 1 hour of the one before and on the same local day, become one 'session' row.
import type { FeedMedia, FeedPost } from '../api/HearthApi';
import type { PhotosRow } from './events';

export const SESSION_GAP_MS = 60 * 60 * 1000;

const ready = (p: FeedPost) => p.media.filter((m) => m.status === 'ready');

const audienceKey = (p: FeedPost) => (p.audience ? p.audience.map((a) => a.circle_id).sort().join(',') : null);

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** b (shared after a) may join a's session. */
export function canJoinSession(a: FeedPost, b: FeedPost): boolean {
  if (a.author_id !== b.author_id) return false;
  if ((a.event_id ?? null) !== (b.event_id ?? null)) return false;
  if (audienceKey(a) !== audienceKey(b)) return false;
  if (!ready(a).length || !ready(b).length) return false;
  const ta = new Date(a.published_at), tb = new Date(b.published_at);
  if (Number.isNaN(ta.getTime()) || Number.isNaN(tb.getTime())) return false;
  if (Math.abs(tb.getTime() - ta.getTime()) > SESSION_GAP_MS) return false;
  return localDay(ta) === localDay(tb);
}

export interface SessionPhoto {
  postId: string;
  /** Its place in its own post (the viewer opens the post there). */
  index: number;
  media: FeedMedia;
}

/** Every ready photo of the session's posts, in posting order. */
export const sessionPhotos = (posts: FeedPost[]): SessionPhoto[] =>
  posts.flatMap((p) => ready(p).map((media, index) => ({ postId: p.post_id, index, media })));

/** Photos' rows (newest first) with runs of 2+ ordinary posts folded into one session row (posts oldest first). */
export function withSessions(rows: PhotosRow[]): PhotosRow[] {
  const out: PhotosRow[] = [];
  let run: FeedPost[] = []; // newest first while collecting
  const flush = () => {
    if (run.length === 1) out.push({ type: 'post', key: run[0]!.post_id, post: run[0]! });
    else if (run.length > 1) {
      const posts = [...run].reverse();
      out.push({ type: 'session', key: `session-${posts[0]!.post_id}`, posts });
    }
    run = [];
  };
  for (const r of rows) {
    if (r.type !== 'post') {
      flush();
      out.push(r);
      continue;
    }
    const prev = run[run.length - 1];
    if (prev && !canJoinSession(r.post, prev)) flush();
    run.push(r.post);
  }
  flush();
  return out;
}
