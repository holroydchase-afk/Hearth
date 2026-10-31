// FLAG-7 / VID-1..9 (SPEC-MEDIA 3.3, BETA-SPEC "Out of beta: video"): the pure-TS video cleaner removes location
// and every other phone metadata from a QuickTime / MP4 file on the phone, without re-encoding, so it runs in Expo Go.
// Removed boxes become zero-filled `free` boxes of the same size, so every sample offset stays valid; the samples of
// tracks that aren't picture or sound (timed metadata, timecode) are zeroed in mdat too.
import { ApiError } from '../../api/HearthApi';
import { cleanVideo, verifyVideoClean, videoMimeType } from '../cleanVideo';
import {
  AUDIO_SAMPLE, DATE_1904, SAMSUNG_TRAILER, VIDEO_SAMPLE, VIDEO_SECRETS, box, concat, contains, indexesOf, movie, topLevel,
} from '../../test/mp4';

const code = (f: () => unknown): string => {
  try { f(); } catch (e) { return e instanceof ApiError ? e.code : `not ApiError: ${String(e)}`; }
  return 'no error';
};

function expectNoSecrets(b: Uint8Array) {
  for (const s of VIDEO_SECRETS) expect({ s, found: contains(b, s) }).toEqual({ s, found: false });
}

/** The 32-bit (v0) or 64-bit (v1) creation date of every mvhd, tkhd and mdhd. */
function dates(b: Uint8Array): number[] {
  const out: number[] = [];
  for (const t of ['mvhd', 'tkhd', 'mdhd']) {
    for (const at of indexesOf(b, new Uint8Array([...t].map((c) => c.charCodeAt(0))))) {
      const v = b[at + 4]!;
      const p = at + 8;
      const read = (o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
      out.push(v === 1 ? read(p) * 2 ** 32 + read(p + 4) : read(p));
    }
  }
  return out;
}

describe('cleanVideo (FLAG-7)', () => {
  it('VID-1 iPhone .mov: no location, make, model, software, XMP, face box or timecode survives anywhere in the file', () => {
    const src = movie();
    for (const s of VIDEO_SECRETS.filter((x) => x !== 'SEFH')) expect({ s, in: contains(src, s) }).toEqual({ s, in: true }); // the fixture really has them
    const out = cleanVideo(src);
    expectNoSecrets(out);
    expect(() => verifyVideoClean(out)).not.toThrow();
  });

  it('VID-2 nothing moves: same length, and the picture and sound samples are byte-identical where the tables point', () => {
    const src = movie();
    const out = cleanVideo(src);
    expect(out.length).toBe(src.length);
    expect(indexesOf(out, VIDEO_SAMPLE)).toEqual(indexesOf(src, VIDEO_SAMPLE));
    expect(indexesOf(out, AUDIO_SAMPLE)).toEqual(indexesOf(src, AUDIO_SAMPLE));
    expect(indexesOf(out, VIDEO_SAMPLE)).toHaveLength(2);
    expect(topLevel(out)).toEqual(['ftyp', 'wide', 'mdat', 'moov']);
  });

  it('VID-3 creation and change dates in mvhd, tkhd and mdhd are zeroed, 32-bit and 64-bit', () => {
    for (const v1 of [false, true]) {
      const src = movie({ v1 });
      expect(dates(src).every((d) => d === DATE_1904)).toBe(true);
      const out = cleanVideo(src);
      expect({ v1, dates: dates(out).filter((d) => d !== 0) }).toEqual({ v1, dates: [] });
    }
  });

  it('VID-4 Android / exported MP4: moov first, Samsung trailer after the last box, 64-bit chunk offsets', () => {
    const src = movie({ brand: 'isom', moovFirst: true, trailer: SAMSUNG_TRAILER, co64: true });
    expect(contains(src, 'SEFH')).toBe(true);
    const out = cleanVideo(src);
    expectNoSecrets(out);
    expect(indexesOf(out, VIDEO_SAMPLE)).toEqual(indexesOf(src, VIDEO_SAMPLE));
    expect(indexesOf(out, AUDIO_SAMPLE)).toEqual(indexesOf(src, AUDIO_SAMPLE));
    expect(() => verifyVideoClean(out)).not.toThrow();
  });

  it('VID-5 the verifier fails closed on what the phone wrote: location first, then dates, then anything unknown', () => {
    expect(code(() => verifyVideoClean(movie()))).toBe('META_LOCATION');
    // Dates alone (no other metadata): META_DATETIME.
    const datedOnly = movie({ bare: true, v1: false });
    const d = cleanVideo(datedOnly);
    const mvhdAt = indexesOf(d, new Uint8Array([0x6d, 0x76, 0x68, 0x64]))[0]!;
    d[mvhdAt + 8] = 0x12; // put a creation date back
    expect(code(() => verifyVideoClean(d))).toBe('META_DATETIME');
    // An unknown box inside moov: META_OTHER.
    const odd = cleanVideo(movie({ bare: true, moovExtra: [box('zzzz', new Uint8Array(4))] }));
    expect(code(() => verifyVideoClean(odd))).toBe('no error');
    const freeAt = indexesOf(odd, new Uint8Array([0x66, 0x72, 0x65, 0x65])).at(-1)!; // the cleaned zzzz
    odd.set([0x7a, 0x7a, 0x7a, 0x7a], freeAt);
    expect(code(() => verifyVideoClean(odd))).toBe('META_OTHER');
  });

  it('VID-6 a file it can\'t read fails closed with EXIF, never passes through', () => {
    expect(code(() => cleanVideo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])))).toBe('EXIF'); // a JPEG
    expect(code(() => cleanVideo(box('ftyp', new Uint8Array(8))))).toBe('EXIF'); // no moov
    const truncated = movie({ moovFirst: true }).subarray(0, movie({ moovFirst: true }).length - 4); // mdat cut short
    expect(code(() => cleanVideo(truncated))).toBe('EXIF');
    const twoMoov = concat(movie({ bare: true }), box('moov', new Uint8Array(8)));
    expect(code(() => cleanVideo(twoMoov))).toBe('EXIF');
  });

  it('VID-7 a sample table pointing outside the file fails closed (EXIF), so a track can\'t hide samples', () => {
    const src = movie({ co64: true });
    const co64At = indexesOf(src, new Uint8Array([0x63, 0x6f, 0x36, 0x34]))[0]!;
    src[co64At + 12] = 0x7f; // the first 64-bit offset's high byte: far past the end
    expect(code(() => cleanVideo(src))).toBe('EXIF');
  });

  it('VID-8 the input is not changed, and cleaning twice gives the same bytes', () => {
    const src = movie({ trailer: SAMSUNG_TRAILER });
    const copy = src.slice();
    const once = cleanVideo(src);
    expect(Buffer.from(src)).toEqual(Buffer.from(copy));
    expect(Buffer.from(cleanVideo(once))).toEqual(Buffer.from(once));
  });

  it('VID-11 the vendor and compressor name in each sample description are zeroed; one put back fails META_SOFTWARE', () => {
    const out = cleanVideo(movie());
    expect(contains(out, 'appl')).toBe(false);
    expect(contains(out, 'H.264')).toBe(false);
    const avc1 = indexesOf(out, new Uint8Array([0x61, 0x76, 0x63, 0x31]))[0]!;
    out.set([0x61, 0x70, 0x70, 0x6c], avc1 + 4 + 12); // 'appl' back at the vendor
    expect(code(() => verifyVideoClean(out))).toBe('META_SOFTWARE');
  });

  it('VID-9 the mime type comes from the file, not the file name: qt brand is video/quicktime, the rest video/mp4', () => {
    expect(videoMimeType(movie())).toBe('video/quicktime');
    expect(videoMimeType(movie({ brand: 'isom' }))).toBe('video/mp4');
    expect(videoMimeType(movie({ brand: 'mp42' }))).toBe('video/mp4');
  });
});

// Real files made by ffmpeg (see src/test/fixtures/README.md): QuickTime with Apple's location key, udta location,
// make, model, dates and a timecode track; MP4 written "fast start" (moov first). VID_OUT=<dir> also writes the
// cleaned copies there, so ffprobe can check them by hand (src/test/fixtures/README.md).
describe('cleanVideo on real files (FLAG-7)', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  for (const name of ['iphone-like.mov', 'android-like.mp4']) {
    it(`VID-10 ${name}: location, make, model, encoder, timecode and dates are gone; the verifier passes`, () => {
      const src = new Uint8Array(fs.readFileSync(path.join(__dirname, '../../test/fixtures', name)));
      const out = cleanVideo(src);
      for (const s of ['+35.6895', 'com.apple.quicktime', 'iPhone 15 Pro', 'Lavf']) expect({ s, found: contains(out, s) }).toEqual({ s, found: false });
      expect(out.length).toBe(src.length);
      expect(() => verifyVideoClean(out)).not.toThrow();
      expect(dates(out).filter((d) => d !== 0)).toEqual([]);
      if (process.env.VID_OUT) fs.writeFileSync(path.join(process.env.VID_OUT, `clean-${name}`), out);
    });
  }
});
