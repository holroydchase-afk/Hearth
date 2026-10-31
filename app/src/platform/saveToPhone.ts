// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// "Save to my phone" (BETA-SEE-5): write the decrypted 2048 px JPEG (already stripped of
// location data before upload) to a temp file, hand it to the photo library, delete the temp.
import { File, Paths } from 'expo-file-system';
// SDK 57 moved these functions to /legacy; the root import now throws on them at runtime.
import * as MediaLibrary from 'expo-media-library/legacy';

export type SaveResult = 'saved' | 'denied';

export async function saveToPhone(bytes: Uint8Array, name: string): Promise<SaveResult> {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) return 'denied';
  const file = new File(Paths.cache, `${name}.jpg`);
  try {
    if (file.exists) file.delete();
    file.create();
    file.write(bytes);
    await MediaLibrary.saveToLibraryAsync(file.uri);
    return 'saved';
  } finally {
    try { file.delete(); } catch { /* already gone */ }
  }
}
