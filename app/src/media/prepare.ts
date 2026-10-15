// QueueItem -> bytes + sign-media spec, using the real pipeline.
import { ApiError } from '../api/HearthApi';
import { readBytes } from '../platform/bytes';
import type { Prepared, QueueItem } from '../upload/queue';
import { expoManipulator } from './expoManipulator';
import { buildUploadSpec, checkVideo, processPhoto } from './pipeline';

/** Video posting stays off until video metadata (iOS location atoms) can be stripped on device. */
export const VIDEO_POSTING_ENABLED = false;

export async function prepareItem(item: QueueItem): Promise<Prepared> {
  if (item.kind === 'video') {
    checkVideo({ durationMs: item.durationMs ?? null });
    throw new ApiError('EXIF', 'video metadata stripping not available');
  }
  const p = await processPhoto({ uri: item.uri }, { manipulator: expoManipulator, readBytes });
  return { spec: buildUploadSpec(p), display: p.display.bytes, thumb: p.thumb.bytes };
}
