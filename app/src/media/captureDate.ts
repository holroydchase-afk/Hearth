// BETA-BULK-1: read when a photo was taken, on the phone. Only the resulting ISO instant
// (`taken_at`) ever leaves the device; GPS, maker and every other EXIF field stay here and
// are stripped by the pipeline as today (pipeline.ts).
//
// Order: EXIF DateTimeOriginal (+ OffsetTimeOriginal if present; without an offset it is the
// phone's local time), then the asset's creation time, then null.

/** What the picker (exif: true) and the media library give us for one asset. */
export interface AssetDateSource {
  exif?: Record<string, unknown> | null;
  /** Milliseconds since epoch (expo-media-library creationTime), if known. */
  creationTime?: number | null;
}

export interface PhoneZone {
  /** IANA zone used when EXIF has no offset. Default: the phone's (Intl.DateTimeFormat().resolvedOptions().timeZone). */
  timeZone?: string;
}

/** When it was taken (ISO UTC) and the calendar day it was taken on ("2024-07-04"). */
export interface CaptureInfo { takenAt: string; dayKey: string }

export function phoneTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** The EXIF field, at the top level (Android) or under {Exif} (iOS). Strings only. */
function exifString(exif: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!exif) return null;
  const top = exif[key];
  if (typeof top === 'string') return top;
  const sub = exif['{Exif}'];
  if (sub && typeof sub === 'object') {
    const v = (sub as Record<string, unknown>)[key];
    if (typeof v === 'string') return v;
  }
  return null;
}

interface Wall { y: number; mo: number; d: number; h: number; mi: number; s: number }

/** "2024:07:04 23:15:00" -> fields, or null if malformed or out of range. */
function parseExifDate(v: string): Wall | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return { y, mo, d, h, mi, s };
}

/** "+09:00" / "-04:00" -> minutes east of UTC, or null. */
function parseOffset(v: string | null): number | null {
  if (!v) return null;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const mins = Number(m[2]) * 60 + Number(m[3]);
  if (mins > 14 * 60) return null;
  return m[1] === '-' ? -mins : mins;
}

/** Wall-clock fields of an instant in a zone. Without Intl time zones (some old Android
 *  JS engines) it falls back to the phone's own clock, which is the zone used by default. */
function wallIn(ms: number, timeZone: string): Wall {
  try {
    return wallInIntl(ms, timeZone);
  } catch {
    const d = new Date(ms);
    return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() };
  }
}

function wallInIntl(ms: number, timeZone: string): Wall {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
}

const wallUtc = (w: Wall) => Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);

/** The instant at which the zone's clock read this wall time. */
function zonedToUtc(w: Wall, timeZone: string): number {
  const guess = wallUtc(w);
  const off1 = wallUtc(wallIn(guess, timeZone)) - guess;
  let t = guess - off1;
  const off2 = wallUtc(wallIn(t, timeZone)) - t;
  if (off2 !== off1) t = guess - off2;
  return t;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (w: Wall) => `${w.y}-${pad(w.mo)}-${pad(w.d)}`;

/** takenAt plus the day it was taken: the photo's own local day if its offset is known, else the phone's day. */
export function captureInfo(a: AssetDateSource, o: PhoneZone = {}): CaptureInfo | null {
  const tz = o.timeZone ?? phoneTimeZone();
  const raw = exifString(a.exif, 'DateTimeOriginal');
  const wall = raw ? parseExifDate(raw) : null;
  if (wall) {
    const off = parseOffset(exifString(a.exif, 'OffsetTimeOriginal'));
    const ms = off !== null ? wallUtc(wall) - off * 60_000 : zonedToUtc(wall, tz);
    if (Number.isFinite(ms)) return { takenAt: new Date(ms).toISOString(), dayKey: dayOf(wall) };
  }
  const ct = a.creationTime;
  if (typeof ct === 'number' && Number.isFinite(ct) && ct > 0) {
    return { takenAt: new Date(ct).toISOString(), dayKey: dayOf(wallIn(ct, tz)) };
  }
  return null;
}

/** ISO 8601 UTC instant ("2024-07-05T03:15:00.000Z") or null when the photo has no usable date. */
export function takenAtFromAsset(a: AssetDateSource, o: PhoneZone = {}): string | null {
  return captureInfo(a, o)?.takenAt ?? null;
}
