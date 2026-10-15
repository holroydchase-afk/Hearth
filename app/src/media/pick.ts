import * as ImagePicker from 'expo-image-picker';
import type { QueueItem } from '../upload/queue';

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
