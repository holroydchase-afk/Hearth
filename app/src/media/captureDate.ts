// BETA-BULK-1: read when a photo was taken, on the phone. Only the resulting ISO instant
// (`taken_at`) ever leaves the device; GPS, maker and every other EXIF field stay here and
// are stripped by the pipeline as today (pipeline.ts).
//
// NOT BUILT YET (overnight plan step 3). The red tests in __tests__/captureDate.test.ts
// define the behavior. Order: EXIF DateTimeOriginal (+ OffsetTimeOriginal if present;
// without an offset it is the phone's local time), then the asset's creation time, then null.

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

/** ISO 8601 UTC instant ("2024-07-05T03:15:00.000Z") or null when the photo has no usable date. */
export function takenAtFromAsset(_a: AssetDateSource, _o: PhoneZone = {}): string | null {
  throw new Error('not built yet: takenAtFromAsset (BETA-BULK-1)');
}
