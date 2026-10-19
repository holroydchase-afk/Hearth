// MEDIA-1 (UAT item 6, Oct 19): Chase's first iPhone photo showed "Didn't send". create_post
// returned 200, sign-media was never called. Cause under test: iOS UIImage.jpegData writes a
// small APP1 Exif block (ColorSpace + pixel size), and the pipeline refused any Exif. The photo
// must be cleaned per the media policy and the upload must go on to sign-media.
import { FakeBackend, FIXTURE } from '../../api/fake/FakeBackend';
import type { HearthApi, UploadItemSpec } from '../../api/HearthApi';
import { encryptMedia } from '../../crypto/media';
import { memoryKV } from '../../platform/kv';
import { contains, iosReencode, segments, startsWith } from '../../test/jpeg';
import { UploadQueue } from '../../upload/queue';
import { hasExif, processPhoto, type Manipulator } from '../pipeline';
import { prepareItem } from '../prepare';

// The on-phone encoder, as iOS behaves: every render writes JFIF + Exif(ColorSpace, size) + ICC.
const mockFiles = new Map<string, Uint8Array>();
let mockN = 0;
const mockIosManipulator: Manipulator = {
  load: async (uri) => ({ width: 4032, height: 3024, handle: uri }),
  render: async (_img, size) => {
    const uri = `file:///cache/ImageManipulator/${++mockN}.jpg`;
    mockFiles.set(uri, iosReencode(size.width, size.height, Math.max(64, Math.round((size.width * size.height) / 2000))));
    return { uri, ...size };
  },
};
// Getters: jest.mock is hoisted above the consts, so read them lazily.
jest.mock('../expoManipulator', () => ({ get expoManipulator() { return mockIosManipulator; } }));
jest.mock('../../platform/bytes', () => ({ readBytes: async (uri: string) => { const b = mockFiles.get(uri); if (!b) throw new Error('no file'); return b; } }));

const CHASE = FIXTURE.users.chase.id;

describe('MEDIA-1 iOS re-encode with an Exif block', () => {
  it('MEDIA-1 processPhoto cleans an iOS Exif block instead of rejecting it (display and thumb have no APP1, ICC kept)', async () => {
    const readBytes = async (u: string) => mockFiles.get(u)!;
    const out = await processPhoto({ uri: 'file:///pick/IMG_0001.HEIC' }, { manipulator: mockIosManipulator, readBytes });
    for (const b of [out.display.bytes, out.thumb.bytes]) {
      expect(hasExif(b)).toBe(false);
      expect(segments(b).head.some((s) => s.marker === 0xe1)).toBe(false);
      expect(segments(b).head.some((s) => s.marker === 0xe2 && startsWith(s.payload, 'ICC_PROFILE'))).toBe(true);
    }
    expect(out.display.width).toBe(2048);
  });

  it('MEDIA-1 the first iPhone photo goes create_post → prepare → sign-media → published, with no error report', async () => {
    const be = FakeBackend.withFixture();
    const api = be.clientFor(CHASE);
    const signed: UploadItemSpec[][] = [];
    const real = api.signUpload.bind(api);
    jest.spyOn(api as HearthApi, 'signUpload').mockImplementation(async (postId, items) => { signed.push(items); return real(postId, items); });
    const puts: Uint8Array[] = [];
    const q = await UploadQueue.open({
      api, kv: memoryKV(), userId: CHASE, prepare: prepareItem,
      setTimer: () => () => {},
      encrypt: (p, dek) => { puts.push(p); return encryptMedia(p, dek); },
    });
    await q.enqueue({ space: FIXTURE.space.id, caption: 'First snow!', circleIds: [FIXTURE.circles.dadSide.id], items: [{ uri: 'file:///pick/IMG_0001.HEIC', kind: 'photo' }] });
    await q.idle();

    q.stop();
    const job = q.jobs()[0]!;
    expect({ state: job.state, errorCode: job.errorCode }).toEqual({ state: 'published', errorCode: undefined });
    expect(signed).toHaveLength(1);
    expect(signed[0]![0]).toMatchObject({ kind: 'photo', mime_type: 'image/jpeg', width: 2048, height: 1536, exif_stripped: true });
    // What was handed to encryption (the plaintext that leaves the phone) carries no Exif.
    expect(puts.length).toBeGreaterThanOrEqual(2);
    for (const p of puts) expect({ app1: hasExif(p), exifHeader: contains(p, 'Exif\0\0') }).toEqual({ app1: false, exifHeader: false });
    expect(be.state.clientErrors ?? []).toEqual([]);
  });
});
