// BETA-BULK-1 (grandparent-ux finding, Oct 17): a capture date more than 1 day in the future is wrong
// (a phone with a bad clock, an edited EXIF date). The phone ignores it, so the photo never lands in
// "2027" on the timeline. The server also clamps taken_at to published_at (backend/tests/timeline_future_test.sql).
import { captureInfo, takenAtFromAsset } from '../captureDate';
import { planBatch, type PickedAsset } from '../../share/bulk';

const NY = { timeZone: 'America/New_York' };
const NOW = Date.UTC(2026, 9, 17, 16, 0, 0); // Oct 17 2026, noon in Charlotte

beforeEach(() => { jest.useFakeTimers({ now: NOW }); });
afterEach(() => { jest.useRealTimers(); });

describe('BETA-BULK-1 future capture dates are ignored on the phone', () => {
  it('BETA-BULK-1 an EXIF date a week ahead is ignored: falls back to the creation time', () => {
    const created = Date.UTC(2026, 9, 1, 15, 0, 0);
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: '2026:10:24 10:00:00', OffsetTimeOriginal: '-04:00' }, creationTime: created }, NY))
      .toBe('2026-10-01T15:00:00.000Z');
  });

  it('BETA-BULK-1 a future EXIF date and a future creation time: no date at all (it sorts by its shared date)', () => {
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: '2027:03:01 10:00:00' }, creationTime: Date.UTC(2027, 2, 1) }, NY)).toBeNull();
    expect(captureInfo({ exif: { DateTimeOriginal: '2027:03:01 10:00:00' } }, NY)).toBeNull();
  });

  it('BETA-BULK-1 up to 1 day ahead is kept (time zones and slightly-off camera clocks)', () => {
    // 9 am Oct 18 in Tokyo = 00:00 UTC Oct 18: 8 hours ahead of now
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: '2026:10:18 09:00:00', OffsetTimeOriginal: '+09:00' } }, NY))
      .toBe('2026-10-18T00:00:00.000Z');
    // exactly 24 h ahead is still kept; 24 h and 1 minute is not
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: '2026:10:18 12:00:00', OffsetTimeOriginal: '-04:00' } }, NY))
      .toBe('2026-10-18T16:00:00.000Z');
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: '2026:10:18 12:01:00', OffsetTimeOriginal: '-04:00' } }, NY)).toBeNull();
  });

  it('BETA-BULK-2 a bulk pick puts a future-dated photo with the undated ones (last), not on a 2027 day', () => {
    const asset = (date: string, i: number): PickedAsset => ({
      uri: `file:///p/${i}.jpg`, type: 'image', mimeType: 'image/jpeg', width: 10, height: 10,
      exif: { DateTimeOriginal: date, OffsetTimeOriginal: '-04:00' },
    });
    const plan = planBatch([asset('2024:07:04 10:00:00', 1), asset('2027:01:01 10:00:00', 2)], NY);
    const days = plan.posts.map((p) => p.dayKey);
    expect(days).not.toContain('2027-01-01');
    expect(days[days.length - 1]).toBeNull();
  });
});
