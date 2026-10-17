import * as ImagePicker from 'expo-image-picker';
import type { QueueItem } from '../upload/queue';
import { BULK_PICK_LIMIT, type PickedAsset } from '../share/bulk';

export type PickResult = { items: QueueItem[] } | { denied: true };

/** Up to 10 photos, picked in one go (BETA-SHARE-1). No editing step, no extra taps. */
export async function pickPhotos(limit = 10): Promise<PickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && perm.accessPrivileges !== 'limited') return { denied: true };
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    exif: false,
    quality: 1,
  });
  if (r.canceled) return { items: [] };
  return {
    items: r.assets.slice(0, limit).map((a) => ({ uri: a.uri, kind: 'photo' as const, width: a.width, height: a.height, durationMs: a.duration ?? null })),
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
  return {
    assets: r.assets.map((a) => ({
      uri: a.uri, type: a.type ?? null, mimeType: a.mimeType ?? null, width: a.width, height: a.height,
      duration: a.duration ?? null, exif: (a.exif as Record<string, unknown> | null | undefined) ?? null,
    })),
  };
}
