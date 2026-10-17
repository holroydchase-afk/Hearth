// BETA-BULK-2/3/5: plan a bulk pick into posts, on the phone.
// Up to 100 photos per pick, grouped by the day taken (phone's time zone) into posts of at
// most 10 (the BETA-SHARE-1 limit). Videos are skipped with a plain line. Only the date read
// on the phone (takenAt) goes into a planned item; never EXIF, GPS or other metadata.
//
// NOT BUILT YET (overnight plan step 3). Red tests: __tests__/bulk.test.ts.
import type { PhoneZone } from '../media/captureDate';
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
export function planBatch(_assets: PickedAsset[], _o: PhoneZone = {}): BatchPlan {
  throw new Error('not built yet: planBatch (BETA-BULK-2)');
}

/** Review screen headline: "48 photos from 3 days". */
export function reviewSummary(_plan: BatchPlan): string {
  throw new Error('not built yet: reviewSummary (BETA-BULK-3)');
}

/** "3 videos were skipped. Hearth sends photos for now." or null when none. */
export function skippedVideosLine(_n: number): string | null {
  throw new Error('not built yet: skippedVideosLine (BETA-BULK-5)');
}

/** Said when a pick goes over 100, or null. */
export function overLimitLine(_n: number): string | null {
  throw new Error('not built yet: overLimitLine (BETA-BULK-2)');
}
