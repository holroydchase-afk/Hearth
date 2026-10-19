// Plain-language messages for API.md error codes. Server text is NEVER shown:
// it can contain SQL, table names or words June doesn't use.
import { ApiError, type ApiErrorCode } from '../api/HearthApi';

export interface MessageContext {
  /** Name of the person who invited this user ("Chase"). */
  inviter?: string | null;
  /** What the person was doing, to pick the right 23514 message. */
  action?: 'post' | 'comment' | 'join' | 'invite' | 'group' | 'other';
}

const KNOWN: ApiErrorCode[] = ['23514', '23505', '42501', 'P0002', '22023', '54000'];

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code ?? '') : '';
  if (KNOWN.includes(code as ApiErrorCode)) return new ApiError(code as ApiErrorCode, msg);
  if (code === 'PGRST301' || code === 'PGRST302' || /jwt/i.test(msg)) return new ApiError('AUTH', msg);
  if (e instanceof TypeError || /network request failed|failed to fetch|load failed|networkerror|timed? ?out|aborted/i.test(msg)) {
    return new ApiError('NETWORK', msg);
  }
  return new ApiError('UNKNOWN', msg || String(e));
}

export function messageFor(e: unknown, ctx: MessageContext = {}): string {
  const err = toApiError(e);
  const who = ctx.inviter?.trim() || null;
  switch (err.code) {
    case '23514':
      if (ctx.action === 'post') return 'Pick who should see it.';
      if (ctx.action === 'comment') return 'Write something first, then tap Send.';
      if (ctx.action === 'group') return 'Give the group a name first.';
      return "That didn't work. Please check what you typed and try again.";
    case '42501':
      return "You can't do that here.";
    case 'P0002':
      return 'This was removed.';
    case '22023':
      return `This invite is too old or already used. Ask ${who ?? 'the person who invited you'} for a new one.`;
    case '54000':
      return 'Too many tries. Wait 10 minutes.';
    case 'BAD_OTP':
      return "That code didn't work. Check the newest email from Hearth and type the 6 numbers again.";
    case 'NETWORK':
      return "No internet right now. We'll keep trying.";
    case 'EXIF':
      return "This photo couldn't be made private, so it wasn't sent. Try a different photo.";
    case 'VIDEO_CAP':
      return 'This family has sent its 10 videos for this month. Photos still work.';
    case 'VIDEO_TOO_LONG':
      return 'This video is longer than 1 minute. Please pick a shorter one.';
    case 'AUTH':
      return 'Please sign in again. We will email you a new code.';
    default:
      return `Something went wrong. Try again${who ? `, or call ${who}` : ''}.`;
  }
}
