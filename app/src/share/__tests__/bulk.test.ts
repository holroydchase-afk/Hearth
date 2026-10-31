// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// BETA-BULK-2, -3, -5: plan a bulk pick into posts on the phone.
import { hasExif, processPhoto, type Manipulator } from '../../media/pipeline';
import { iosReencode } from '../../test/jpeg';
import { BULK_PICK_LIMIT, PHOTOS_PER_POST, overLimitLine, planBatch, reviewSummary, skippedVideosLine, type PickedAsset } from '../bulk';

// The phone is in Eastern time (passed explicitly: Jest sandboxes process.env.TZ).
const NY = { timeZone: 'America/New_York' };

const GPS = { GPSLatitude: 35.2271, GPSLongitude: -80.8431 };
let n = 0;
/** A picked iPhone photo with full EXIF: date, offset, GPS, maker. */
function photo(date: string, offset: string | null = '-04:00', over: Partial<PickedAsset> = {}): PickedAsset {
  n += 1;
  return {
    uri: `file:///picked/IMG_${String(n).padStart(4, '0')}.jpg`, type: 'image', mimeType: 'image/jpeg', width: 4032, height: 3024,
    exif: { DateTimeOriginal: date, ...(offset ? { OffsetTimeOriginal: offset } : {}), ...GPS, Make: 'Apple', Model: 'iPhone 15' },
    ...over,
  };
}
function day(d: string, count: number, startHour = 8): PickedAsset[] {
  return Array.from({ length: count }, (_, i) => photo(`${d} ${String(startHour + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}:00`));
}
const video = (): PickedAsset => ({ uri: `file:///picked/MOV_${++n}.mov`, type: 'video', mimeType: 'video/quicktime', duration: 12_000 });

describe('BETA-BULK-2 planBatch: one post per day, at most 10 photos each', () => {
  it('BETA-BULK-2 limits are 100 per pick and 10 per post', () => {
    expect(BULK_PICK_LIMIT).toBe(100);
    expect(PHOTOS_PER_POST).toBe(10);
  });

  it('BETA-BULK-2 48 photos from 3 days become 5 posts, oldest day first', () => {
    const picked = [...day('2024:07:04', 20), ...day('2024:07:05', 18), ...day('2024:07:06', 10)];
    const plan = planBatch(picked, NY);
    expect(plan.posts.map((p) => p.items.length)).toEqual([10, 10, 10, 8, 10]);
    expect(plan.posts.map((p) => p.dayKey)).toEqual(['2024-07-04', '2024-07-04', '2024-07-05', '2024-07-05', '2024-07-06']);
    expect(plan.photoCount).toBe(48);
    expect(plan.dayCount).toBe(3);
    expect(plan.skippedVideos).toBe(0);
    expect(plan.overLimit).toBe(0);
  });

  it('BETA-BULK-2 pick order does not matter: photos sort by time inside each day', () => {
    const picked = [...day('2024:07:05', 3), ...day('2024:07:04', 3)].reverse();
    const plan = planBatch(picked, NY);
    expect(plan.posts.map((p) => p.dayKey)).toEqual(['2024-07-04', '2024-07-05']);
    for (const p of plan.posts) {
      const ts = p.items.map((i) => i.takenAt!);
      expect([...ts].sort()).toEqual(ts);
      expect(p.takenAt).toBe(ts[0]); // a post is dated by its earliest photo
    }
  });

  it('BETA-BULK-2 exactly 10 is one post; 11 is two (10 + 1)', () => {
    expect(planBatch(day('2024:01:01', 10), NY).posts.map((p) => p.items.length)).toEqual([10]);
    expect(planBatch(day('2024:01:02', 11), NY).posts.map((p) => p.items.length)).toEqual([10, 1]);
  });

  it('BETA-BULK-2 time zones: an 11:30 pm vacation photo stays on the day it was taken', () => {
    // Taken 11:30 pm in Los Angeles (-07:00) = 2:30 am Eastern the next day. The phone is in Eastern now.
    const la = photo('2024:07:04 23:30:00', '-07:00');
    // Taken 11:30 pm at home with no offset recorded: the phone's zone decides.
    const home = photo('2024:07:04 23:30:00', null);
    const plan = planBatch([la, home], NY);
    expect(plan.posts.map((p) => p.dayKey)).toEqual(['2024-07-04']);
    expect(plan.posts[0]!.items).toHaveLength(2);
  });

  it("BETA-BULK-2 time zones: with only a creation time, the day is the phone's day (11:30 pm Eastern is still Jul 4)", () => {
    const late = photo('x', null, { exif: {}, creationTime: Date.UTC(2024, 6, 5, 3, 30, 0) }); // Jul 4, 11:30 pm EDT
    expect(planBatch([late], NY).posts[0]!.dayKey).toBe('2024-07-04');
    expect(planBatch([late], { timeZone: 'UTC' }).posts[0]!.dayKey).toBe('2024-07-05');
  });

  it('BETA-BULK-2 undated photos go together, last, with no date', () => {
    const undated = [photo('x', null, { exif: {} }), photo('x', null, { exif: null })];
    const plan = planBatch([...undated, ...day('2024:07:04', 2)], NY);
    expect(plan.posts.map((p) => p.dayKey)).toEqual(['2024-07-04', null]);
    expect(plan.posts[1]!.takenAt).toBeNull();
    expect(plan.posts[1]!.items.map((i) => i.takenAt ?? null)).toEqual([null, null]);
  });

  it('BETA-BULK-2 creation time is used when a photo has no EXIF date', () => {
    const p = photo('x', null, { exif: { Make: 'Apple' }, creationTime: Date.UTC(2023, 4, 1, 16, 0, 0) });
    const plan = planBatch([p], NY);
    expect(plan.posts[0]!.dayKey).toBe('2023-05-01');
    expect(plan.posts[0]!.takenAt).toBe('2023-05-01T16:00:00.000Z');
  });

  it('BETA-BULK-2 a pick over 100 keeps the first 100 (pick order) and says so', () => {
    const picked = day('2024:03:01', 60).concat(day('2024:03:02', 60));
    const plan = planBatch(picked, NY);
    expect(plan.photoCount).toBe(100);
    expect(plan.overLimit).toBe(20);
    const kept = new Set(plan.posts.flatMap((p) => p.items.map((i) => i.uri)));
    expect(kept).toEqual(new Set(picked.slice(0, 100).map((a) => a.uri)));
    expect(plan.posts.every((p) => p.items.length <= 10)).toBe(true);
    expect(overLimitLine(20)).toBe('Hearth sends up to 100 photos at a time, so 20 were left out. Pick them next time.');
    expect(overLimitLine(1)).toBe('Hearth sends up to 100 photos at a time, so 1 was left out. Pick it next time.');
    expect(overLimitLine(0)).toBeNull();
  });

  it('BETA-BULK-1/2 privacy: a planned item carries the date only, no EXIF, GPS or maker data', () => {
    const plan = planBatch(day('2024:07:04', 3), NY);
    for (const it of plan.posts.flatMap((p) => p.items)) {
      expect(Object.keys(it).sort()).toEqual(expect.arrayContaining(['kind', 'takenAt', 'uri']));
      expect(Object.keys(it).every((k) => ['uri', 'kind', 'width', 'height', 'durationMs', 'takenAt'].includes(k))).toBe(true);
    }
    expect(JSON.stringify(plan)).not.toMatch(/GPS|35\.22|Apple|iPhone|exif/i);
  });
});

describe('BETA-BULK-3 review screen words', () => {
  it('BETA-BULK-3 "48 photos from 3 days"; singular forms read right', () => {
    const plan = planBatch([...day('2024:07:04', 20), ...day('2024:07:05', 18), ...day('2024:07:06', 10)], NY);
    expect(reviewSummary(plan)).toBe('48 photos from 3 days');
    expect(reviewSummary(planBatch(day('2024:07:04', 1), NY))).toBe('1 photo from 1 day');
  });
});

describe('BETA-BULK-5 videos, Live Photos, HEIC', () => {
  it('BETA-BULK-5 videos are skipped with a plain line and do not count toward 100', () => {
    const plan = planBatch([video(), ...day('2024:07:04', 5), video(), video()], NY);
    expect(plan.skippedVideos).toBe(3);
    expect(plan.photoCount).toBe(5);
    expect(plan.posts.flatMap((p) => p.items).every((i) => i.kind === 'photo')).toBe(true);
    expect(skippedVideosLine(3)).toBe("Hearth can't send videos yet, so 3 videos were left out.");
    expect(skippedVideosLine(1)).toBe("Hearth can't send videos yet, so 1 video was left out.");
    expect(skippedVideosLine(0)).toBeNull();
  });

  // Fixtures: a Live Photo (still + paired motion) and a HEIC, both with full EXIF.
  const live: PickedAsset = { uri: 'file:///picked/IMG_LIVE.HEIC', type: 'livePhoto', mimeType: 'image/heic', width: 4032, height: 3024,
    exif: { DateTimeOriginal: '2024:07:04 18:00:00', OffsetTimeOriginal: '-04:00', ...GPS } };
  const pairedMotion: PickedAsset = { uri: 'file:///picked/IMG_LIVE.MOV', type: 'pairedVideo', mimeType: 'video/quicktime', duration: 3000 };
  const heic: PickedAsset = { uri: 'file:///picked/IMG_0002.HEIC', type: 'image', mimeType: 'image/heic', width: 4032, height: 3024,
    exif: { DateTimeOriginal: '2024:07:04 19:00:00', OffsetTimeOriginal: '-04:00', ...GPS } };

  it('BETA-BULK-5 a Live Photo comes through as one still with its date; the motion part is dropped, not counted as a video', () => {
    const plan = planBatch([live, pairedMotion], NY);
    expect(plan.photoCount).toBe(1);
    expect(plan.skippedVideos).toBe(0);
    expect(plan.posts[0]!.items).toEqual([expect.objectContaining({ uri: live.uri, kind: 'photo', takenAt: '2024-07-04T22:00:00.000Z' })]);
  });

  it('BETA-BULK-5 Live Photo and HEIC each become one JPEG with no EXIF and keep their date', async () => {
    const plan = planBatch([live, pairedMotion, heic], NY);
    const items = plan.posts.flatMap((p) => p.items);
    expect(items.map((i) => i.takenAt)).toEqual(['2024-07-04T22:00:00.000Z', '2024-07-04T23:00:00.000Z']);
    // The decoder reads the HEIC (with its EXIF); the encoder writes a fresh JPEG that, as on iOS,
    // still carries a small Exif block (MEDIA-1), which the pipeline must clean.
    const out = new Map<string, Uint8Array>();
    const jpeg = iosReencode();
    let k = 0;
    const m: Manipulator = {
      load: async (uri) => ({ width: 4032, height: 3024, handle: uri }),
      render: async (_img, size) => { const uri = `file:///cache/o${++k}.jpg`; out.set(uri, jpeg); return { uri, ...size }; },
    };
    for (const it of items) {
      const p = await processPhoto({ uri: it.uri }, { manipulator: m, readBytes: async (u) => out.get(u)! });
      expect(p.mime_type).toBe('image/jpeg');
      expect(hasExif(p.display.bytes)).toBe(false);
      expect(hasExif(p.thumb.bytes)).toBe(false);
    }
  });
});
