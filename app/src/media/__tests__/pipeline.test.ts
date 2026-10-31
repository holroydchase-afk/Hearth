import { encryptedSize } from '../../crypto/media';
import {
  DISPLAY_LONG_EDGE, THUMB_MAX_BYTES, buildUploadSpec, checkVideo, fitLongEdge, hasExif, processPhoto,
  type Manipulator,
} from '../pipeline';

/** A JPEG-ish byte string: SOI, optional APP1/Exif segment, filler, EOI. */
function fakeJpeg(size: number, withExif = false): Uint8Array {
  const head = [0xff, 0xd8];
  const exif = withExif ? [0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 1, 2, 3, 4, 5, 6, 7, 8] : [];
  const jfif = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const body = new Array(Math.max(0, size - head.length - exif.length - jfif.length - 4)).fill(0x11);
  return new Uint8Array([...head, ...exif, ...jfif, 0xff, 0xda, ...body, 0xff, 0xd9]);
}

/**
 * Mock manipulator. `oriented` is what the decoder reports AFTER applying EXIF orientation,
 * which is how expo-image-manipulator behaves (it normalizes rotation on load).
 */
function mockManipulator(oriented: { width: number; height: number }, opts: { thumbBytes?: (q: number, w: number) => number; displayBytes?: number; leaveExif?: boolean } = {}) {
  const files = new Map<string, Uint8Array>();
  let n = 0;
  const calls: { size: { width: number; height: number }; quality: number }[] = [];
  const m: Manipulator = {
    load: jest.fn(async (uri: string) => ({ width: oriented.width, height: oriented.height, handle: uri })),
    render: jest.fn(async (_img, size, quality) => {
      calls.push({ size, quality });
      const uri = `file:///cache/out-${++n}.jpg`;
      const isThumb = Math.max(size.width, size.height) < DISPLAY_LONG_EDGE / 2;
      const len = isThumb ? (opts.thumbBytes ?? (() => 30_000))(quality, Math.max(size.width, size.height)) : opts.displayBytes ?? 350_000;
      files.set(uri, fakeJpeg(len, !!opts.leaveExif));
      return { uri, width: size.width, height: size.height };
    }),
  };
  const readBytes = jest.fn(async (uri: string) => {
    const b = files.get(uri);
    if (!b) throw new Error('no file ' + uri);
    return b;
  });
  return { m, readBytes, calls };
}

describe('fitLongEdge (BETA-SHARE-5)', () => {
  it.each([
    [4032, 3024, 2048, 1536], // 12 MP landscape
    [3024, 4032, 1536, 2048], // 12 MP portrait
    [4000, 3000, 2048, 1536],
    [4000, 1000, 2048, 512],
    [2048, 2048, 2048, 2048],
    [800, 600, 800, 600], // never upscale
    [4031, 3023, 2048, 1536],
  ])('%ix%i → %ix%i', (w, h, ew, eh) => {
    const r = fitLongEdge(w, h, 2048);
    expect(r).toEqual({ width: ew, height: eh });
  });

  it('long edge is exactly the limit (±1 px) for many odd sizes', () => {
    for (let w = 2049; w < 9000; w += 997) {
      for (const h of [1, 333, 2048, 4321]) {
        const r = fitLongEdge(w, h, 2048);
        expect(Math.abs(Math.max(r.width, r.height) - 2048)).toBeLessThanOrEqual(1);
        expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('processPhoto (BETA-SHARE-2, BETA-SHARE-5)', () => {
  it('resizes a 12 MP photo to a 2048 px long edge plus a thumbnail of about 40 KB', async () => {
    const { m, readBytes } = mockManipulator({ width: 4032, height: 3024 });
    const out = await processPhoto({ uri: 'file:///pick/IMG_1.HEIC' }, { manipulator: m, readBytes });
    expect(out.display.width).toBe(2048);
    expect(out.display.height).toBe(1536);
    expect(out.thumb.bytes.length).toBeLessThanOrEqual(THUMB_MAX_BYTES);
    expect(out.mime_type).toBe('image/jpeg');
  });

  it('keeps orientation: a portrait photo (EXIF-rotated) stays portrait', async () => {
    const { m, readBytes } = mockManipulator({ width: 3024, height: 4032 });
    const out = await processPhoto({ uri: 'file:///pick/portrait.jpg' }, { manipulator: m, readBytes });
    expect(out.display.height).toBe(2048);
    expect(out.display.width).toBe(1536);
    expect(out.thumb.height).toBeGreaterThan(out.thumb.width);
  });

  it('always re-encodes, even a small photo, so metadata never rides along', async () => {
    const { m, readBytes } = mockManipulator({ width: 800, height: 600 });
    const out = await processPhoto({ uri: 'file:///pick/small.jpg' }, { manipulator: m, readBytes });
    expect(m.render).toHaveBeenCalled();
    expect(out.display.uri).not.toBe('file:///pick/small.jpg');
    expect(out.display.width).toBe(800);
  });

  it('shrinks the thumbnail until it is under the cap', async () => {
    const { m, readBytes, calls } = mockManipulator(
      { width: 4032, height: 3024 },
      { thumbBytes: (q, edge) => Math.round(160_000 * q * (edge / 480)) },
    );
    const out = await processPhoto({ uri: 'file:///pick/busy.jpg' }, { manipulator: m, readBytes });
    expect(out.thumb.bytes.length).toBeLessThanOrEqual(THUMB_MAX_BYTES);
    expect(calls.length).toBeGreaterThan(2);
  });

  // R12 / RV-P5: a busy photo used to be encoded up to 7 times to find a thumbnail size.
  // The display JPEG's bytes per pixel predict the thumbnail's, so the loop starts near the answer.
  const busyThumb = (displayBytes: number) => (q: number, edge: number) =>
    Math.round((displayBytes / (2048 * 1536)) * edge * edge * 0.75 * (q / 0.82) * 1.3);

  it('R12 RV-P5: a busy photo gets its thumbnail in at most 2 encodes, still under 40 KB', async () => {
    const { m, readBytes, calls } = mockManipulator({ width: 4032, height: 3024 }, { displayBytes: 3_000_000, thumbBytes: busyThumb(3_000_000) });
    const out = await processPhoto({ uri: 'file:///pick/busy.jpg' }, { manipulator: m, readBytes });
    expect(calls.length - 1).toBeLessThanOrEqual(2);
    expect(out.thumb.bytes.length).toBeLessThanOrEqual(40_000);
  });

  it('R12 RV-P5: a plain photo still gets the sharpest thumbnail (first try, 480 px)', async () => {
    const { m, readBytes, calls } = mockManipulator({ width: 4032, height: 3024 }, { displayBytes: 300_000, thumbBytes: busyThumb(300_000) });
    const out = await processPhoto({ uri: 'file:///pick/plain.jpg' }, { manipulator: m, readBytes });
    expect(calls.length).toBe(2);
    expect(Math.max(out.thumb.width, out.thumb.height)).toBe(480);
  });

  // Was "refuses to continue if the re-encoded file still carries EXIF": that refusal is the
  // UAT item 6 bug. MEDIA-1 replaces it: an encoder's Exif block is cleaned, and the pipeline
  // still fails closed when it can't read what the encoder made (META_* is covered in clean.test.ts).
  it('MEDIA-1 an Exif block left by the encoder is cleaned, not refused', async () => {
    const { m, readBytes } = mockManipulator({ width: 4032, height: 3024 }, { leaveExif: true });
    const out = await processPhoto({ uri: 'file:///pick/x.jpg' }, { manipulator: m, readBytes });
    expect([hasExif(out.display.bytes), hasExif(out.thumb.bytes)]).toEqual([false, false]);
  });

  it('MEDIA-3 refuses to continue (EXIF) if the encoder output is not a readable JPEG', async () => {
    const { m } = mockManipulator({ width: 4032, height: 3024 });
    const readBytes = async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    await expect(processPhoto({ uri: 'file:///pick/x.jpg' }, { manipulator: m, readBytes })).rejects.toMatchObject({ code: 'EXIF' });
  });
});

describe('hasExif', () => {
  it('finds an APP1 Exif segment and ignores a clean JPEG', () => {
    expect(hasExif(fakeJpeg(1000, true))).toBe(true);
    expect(hasExif(fakeJpeg(1000, false))).toBe(false);
  });
});

describe('checkVideo (BETA-SHARE-6)', () => {
  it('allows up to 60 s and refuses longer with VIDEO_TOO_LONG', () => {
    expect(() => checkVideo({ durationMs: 60_000 })).not.toThrow();
    expect(() => checkVideo({ durationMs: 60_001 })).toThrow(expect.objectContaining({ code: 'VIDEO_TOO_LONG' }));
    expect(() => checkVideo({ durationMs: null })).toThrow(expect.objectContaining({ code: 'VIDEO_TOO_LONG' }));
  });
});

describe('buildUploadSpec', () => {
  it('declares ciphertext sizes and exif_stripped: true', async () => {
    const { m, readBytes } = mockManipulator({ width: 4032, height: 3024 });
    const out = await processPhoto({ uri: 'file:///pick/IMG_1.jpg' }, { manipulator: m, readBytes });
    const spec = buildUploadSpec(out);
    expect(spec).toEqual({
      kind: 'photo', mime_type: 'image/jpeg', width: 2048, height: 1536, duration_ms: null,
      byte_size: encryptedSize(out.display.bytes.length),
      thumb_byte_size: encryptedSize(out.thumb.bytes.length),
      exif_stripped: true,
    });
  });
});

describe('processVideo (FLAG-7)', () => {
  const { movie, contains, SAMSUNG_TRAILER } = require('../../test/mp4') as typeof import('../../test/mp4');
  const { processVideo } = require('../pipeline') as typeof import('../pipeline');

  it('VID-12 reads the picked file, cleans it on the phone and names its type from the file', async () => {
    const src = movie({ brand: 'isom', moovFirst: true, trailer: SAMSUNG_TRAILER });
    const readBytes = jest.fn(async () => src);
    const v = await processVideo({ uri: 'file:///pick.mp4', durationMs: 12_000 }, { readBytes });
    expect(readBytes).toHaveBeenCalledWith('file:///pick.mp4');
    expect(v.kind).toBe('video');
    expect(v.mime_type).toBe('video/mp4');
    expect(v.duration_ms).toBe(12_000);
    expect(contains(v.bytes, '+35.6895')).toBe(false);
    expect(v.bytes.length).toBe(src.length);
  });

  it('VID-12 refuses a video over 60 s before reading it, and a file it can\'t read with EXIF', async () => {
    const readBytes = jest.fn(async () => movie());
    await expect(processVideo({ uri: 'file:///long.mov', durationMs: 61_000 }, { readBytes })).rejects.toMatchObject({ code: 'VIDEO_TOO_LONG' });
    expect(readBytes).not.toHaveBeenCalled();
    await expect(processVideo({ uri: 'file:///x.mov', durationMs: 5_000 }, { readBytes: async () => new Uint8Array([1, 2, 3]) }))
      .rejects.toMatchObject({ code: 'EXIF' });
  });
});
