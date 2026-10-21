import * as ImagePicker from 'expo-image-picker';
// SDK 57 moved these functions to /legacy; the root import now throws on them at runtime.
import * as MediaLibrary from 'expo-media-library/legacy';
import { captureInfo } from './captureDate';
import type { QueueItem } from '../upload/queue';
import { BULK_PICK_LIMIT, type PickedAsset } from '../share/bulk';

export type PickResult = { items: QueueItem[] } | { denied: true };

/**
 * Up to 10 photos, picked in one go (BETA-SHARE-1). No editing step, no extra taps.
 * Videos are offered only when the server has video_posting on for this person (FLAG-5).
 */
export async function pickPhotos(limit = 10, opts: { videos: boolean } = { videos: false }): Promise<PickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && perm.accessPrivileges !== 'limited') return { denied: true };
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: opts.videos ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    exif: false,
    quality: 1,
  });
  if (r.canceled) return { items: [] };
  return {
    items: r.assets.slice(0, limit).map((a) => ({ uri: a.uri, kind: opts.videos && a.type === 'video' ? 'video' as const : 'photo' as const, width: a.width, height: a.height, durationMs: a.duration ?? null })),
  };
}

/**
 * BETA-BULK-1/2: up to 100 photos (and any videos, so we can say they were skipped), with EXIF
 * so the capture date can be read on the phone. The EXIF stays in memory here and is dropped by
 * planBatch; only takenAt leaves. The pipeline re-encodes and refuses any output with EXIF.
 */
export async function pickBulk(): Promise<{ assets: PickedAsset[] } | { denied: true }> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && perm.accessPrivileges !== 'limited') return { denied: true };
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    selectionLimit: BULK_PICK_LIMIT,
    exif: true,
    quality: 1,
  });
  if (r.canceled) return { assets: [] };
  const assets: PickedAsset[] = r.assets.map((a) => ({
    uri: a.uri, type: a.type ?? null, mimeType: a.mimeType ?? null, width: a.width, height: a.height,
    duration: a.duration ?? null, exif: (a.exif as Record<string, unknown> | null | undefined) ?? null,
    assetId: a.assetId ?? null,
  }));
  await addLibraryInfo(assets, r.assets.map((a) => a.assetId ?? null));
  return { assets };
}

/**
 * BETA-BULK-1 fallback: a photo with no usable EXIF date (screenshots, saved or forwarded photos) takes the
 * photo library's creation time. Read only for those photos, and only when the Photos access the picker
 * already asked for is there: never a new prompt. Only the number is kept; the library's location and
 * EXIF are dropped here. Any failure (web, no access, a missing asset) leaves the date null.
 * R15 HELP-SHOT-1: the same read (plus PNGs, the usual screenshot format) says whether it is a screenshot:
 * iPhone's "screenshot" subtype or Android's "Screenshots" album. Only true/false is kept.
 */
async function addLibraryInfo(assets: PickedAsset[], ids: (string | null)[]): Promise<void> {
  const undated = assets.map((a, i) => i).filter((i) => ids[i] && (!captureInfo({ exif: assets[i]!.exif }) || assets[i]!.mimeType === 'image/png'));
  if (!undated.length) return;
  let shotsAlbum: Promise<string | null> | null = null;
  const screenshotsAlbumId = () => (shotsAlbum ??= MediaLibrary.getAlbumAsync('Screenshots').then((a) => a?.id ?? null, () => null));
  try {
    const perm = await MediaLibrary.getPermissionsAsync();
    if (!perm.granted && perm.accessPrivileges !== 'limited') return;
  } catch {
    return;
  }
  for (const i of undated) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(ids[i]!, { shouldDownloadFromNetwork: false });
      const ct = info.creationTime;
      if (!captureInfo({ exif: assets[i]!.exif }) && typeof ct === 'number' && Number.isFinite(ct) && ct > 0) assets[i]!.creationTime = ct;
      if (info.mediaSubtypes?.includes('screenshot')) assets[i]!.screenshot = true;
      else if (info.albumId && info.albumId === (await screenshotsAlbumId())) assets[i]!.screenshot = true;
    } catch {
      /* leave it undated */
    }
  }
}
