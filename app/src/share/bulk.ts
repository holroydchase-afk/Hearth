// BETA-BULK-2/3/5: plan a bulk pick into posts, on the phone.
// Up to 100 photos per pick, grouped by the day taken (phone's time zone) into posts of at
// most 10 (the BETA-SHARE-1 limit). Videos are skipped with a plain line. Only the date read
// on the phone (takenAt) goes into a planned item; never EXIF, GPS or other metadata.
import { captureInfo, type PhoneZone } from '../media/captureDate';
import type { QueueItem } from '../upload/queue';

export const BULK_PICK_LIMIT = 100;
export const PHOTOS_PER_POST = 10;

/** One picked asset, as expo-image-picker returns it (exif: true), plus creationTime from the media library. */
export interface PickedAsset {
  uri: string;
  type?: 'image' | 'video' | 'livePhoto' | 'pairedVideo' | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
  duration?: number | null;
  exif?: Record<string, unknown> | null;
  creationTime?: number | null;
  /** The photo library's id, when the picker gives one (HELP-DUP-1). Never sent. */
  assetId?: string | null;
  /** The library marks it a screenshot (HELP-SHOT-1). Read on the phone, never sent. */
  screenshot?: boolean;
}

export interface PlannedPost {
  /** "2024-07-04" in the phone's time zone; null for the undated group. */
  dayKey: string | null;
  /** Earliest takenAt among its photos (ISO), or null. */
  takenAt: string | null;
  items: QueueItem[];
}

export interface BatchPlan {
  posts: PlannedPost[];
  photoCount: number;
  dayCount: number;
  skippedVideos: number;
  /** Photos past the 100 cap (not sent; pick them next time). */
  overLimit: number;
}

/** Day = the photo's own local day when its offset is known, else the day in the phone's zone. */
export function planBatch(assets: PickedAsset[], o: PhoneZone = {}): BatchPlan {
  let skippedVideos = 0;
  const photos: PickedAsset[] = [];
  for (const a of assets) {
    if (a.type === 'pairedVideo') continue; // a Live Photo's motion part: the still is what we send
    if (a.type === 'video' || (!a.type && typeof a.mimeType === 'string' && a.mimeType.startsWith('video/'))) {
      skippedVideos += 1;
      continue;
    }
    photos.push(a);
  }
  const kept = photos.slice(0, BULK_PICK_LIMIT);
  const overLimit = photos.length - kept.length;

  // Only the date leaves this function: never EXIF, GPS or maker data.
  const byDay = new Map<string | null, QueueItem[]>();
  for (const a of kept) {
    const info = captureInfo(a, o);
    const item: QueueItem = { uri: a.uri, kind: 'photo', takenAt: info?.takenAt ?? null };
    if (typeof a.width === 'number') item.width = a.width;
    if (typeof a.height === 'number') item.height = a.height;
    const key = info?.dayKey ?? null;
    const list = byDay.get(key) ?? [];
    list.push(item);
    byDay.set(key, list);
  }
  const days = [...byDay.keys()].filter((k): k is string => k !== null).sort();
  const order: (string | null)[] = byDay.has(null) ? [...days, null] : days;

  const posts: PlannedPost[] = [];
  for (const dayKey of order) {
    const items = byDay.get(dayKey)!;
    if (dayKey !== null) items.sort((x, y) => (x.takenAt! < y.takenAt! ? -1 : x.takenAt! > y.takenAt! ? 1 : 0));
    for (let i = 0; i < items.length; i += PHOTOS_PER_POST) {
      const chunk = items.slice(i, i + PHOTOS_PER_POST);
      posts.push({ dayKey, takenAt: chunk[0]?.takenAt ?? null, items: chunk });
    }
  }
  return { posts, photoCount: kept.length, dayCount: days.length, skippedVideos, overLimit };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Review screen headline: "48 photos from 3 days". */
export function reviewSummary(plan: BatchPlan): string {
  const photos = plural(plan.photoCount, 'photo', 'photos');
  return plan.dayCount > 0 ? `${photos} from ${plural(plan.dayCount, 'day', 'days')}` : photos;
}

/** "Hearth can't send videos yet, so 3 videos were left out." or null when none. */
export function skippedVideosLine(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "Hearth can't send videos yet, so 1 video was left out." : `Hearth can't send videos yet, so ${n} videos were left out.`;
}

/** Said when a pick goes over 100, or null. */
export function overLimitLine(n: number): string | null {
  if (n <= 0) return null;
  return n === 1
    ? 'Hearth sends up to 100 photos at a time, so 1 was left out. Pick it next time.'
    : `Hearth sends up to 100 photos at a time, so ${n} were left out. Pick them next time.`;
}
