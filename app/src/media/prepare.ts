// QueueItem -> bytes + sign-media spec, using the real pipeline.
import { ApiError } from '../api/HearthApi';
import { readBytes } from '../platform/bytes';
import type { Prepared, QueueItem } from '../upload/queue';
import { expoManipulator } from './expoManipulator';
import { buildUploadSpec, checkVideo, processPhoto } from './pipeline';

export async function prepareItem(item: QueueItem): Promise<Prepared> {
  // FLAG-5: whether video is offered is the server's video_posting feature (my_features); sign-media refuses
  // video while it is off (FLAG-4). Until on-phone transcode strips location (FLAG-7), a video still stops here.
  if (item.kind === 'video') {
    checkVideo({ durationMs: item.durationMs ?? null });
    throw new ApiError('EXIF', 'video metadata stripping not available');
  }
  const p = await processPhoto({ uri: item.uri }, { manipulator: expoManipulator, readBytes });
  return { spec: buildUploadSpec(p), display: p.display.bytes, thumb: p.thumb.bytes };
}
