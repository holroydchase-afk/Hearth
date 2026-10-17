// BETA-BULK-1: the capture date is read on the phone; only taken_at leaves it.
// The phone is in Eastern time for these tests (passed explicitly: Jest sandboxes process.env.TZ).
import { takenAtFromAsset } from '../captureDate';

const GPS = { GPSLatitude: 35.2271, GPSLongitude: -80.8431, GPSLatitudeRef: 'N', GPSLongitudeRef: 'W' };
const MAKER = { Make: 'Apple', Model: 'iPhone 15', LensModel: 'iPhone 15 back camera' };

const NY = { timeZone: 'America/New_York' };

describe('BETA-BULK-1 takenAtFromAsset: EXIF date, offset, fallback, none', () => {
  it('BETA-BULK-1 DateTimeOriginal + OffsetTimeOriginal gives the exact instant (11:15 pm EDT = 03:15 UTC next day)', () => {
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: '2024:07:04 23:15:00', OffsetTimeOriginal: '-04:00', ...GPS } }, NY))
      .toBe('2024-07-05T03:15:00.000Z');
  });

  it('BETA-BULK-1 a photo taken abroad keeps its own offset, whatever zone the phone is in now', () => {
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: '2024:07:04 08:00:00', OffsetTimeOriginal: '+09:00' } }, NY))
      .toBe('2024-07-03T23:00:00.000Z');
  });

  it("BETA-BULK-1 no offset: the date is read as the phone's local time", () => {
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: '2024:07:04 23:15:00' } }, NY)).toBe('2024-07-05T03:15:00.000Z');
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: '2024:07:04 23:15:00' } }, { timeZone: 'America/Los_Angeles' })).toBe('2024-07-05T06:15:00.000Z');
  });

  it('BETA-BULK-1 iPhone shape: the date sits under {Exif} (expo-image-picker on iOS)', () => {
    expect(takenAtFromAsset({ exif: { '{Exif}': { DateTimeOriginal: '2024:12:25 09:30:00', OffsetTimeOriginal: '-05:00' }, '{GPS}': { Latitude: 35.2 } } }, NY))
      .toBe('2024-12-25T14:30:00.000Z');
  });

  it('BETA-BULK-1 no EXIF date: falls back to the creation time', () => {
    const t = Date.UTC(2023, 4, 1, 16, 0, 0);
    expect(takenAtFromAsset({ exif: { ...MAKER }, creationTime: t }, NY)).toBe('2023-05-01T16:00:00.000Z');
    expect(takenAtFromAsset({ exif: null, creationTime: t }, NY)).toBe('2023-05-01T16:00:00.000Z');
  });

  it('BETA-BULK-1 the edit date (DateTime) is not the capture date: falls back to creation time', () => {
    const t = Date.UTC(2022, 0, 2, 12, 0, 0);
    expect(takenAtFromAsset({ exif: { DateTime: '2026:10:17 03:00:00' }, creationTime: t }, NY)).toBe('2022-01-02T12:00:00.000Z');
  });

  it('BETA-BULK-1 a zeroed or malformed EXIF date is ignored', () => {
    const t = Date.UTC(2021, 6, 1, 12, 0, 0);
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: '0000:00:00 00:00:00' }, creationTime: t }, NY)).toBe('2021-07-01T12:00:00.000Z');
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: 'yesterday' }, creationTime: t }, NY)).toBe('2021-07-01T12:00:00.000Z');
    expect(takenAtFromAsset({ exif: { DateTimeOriginal: '2024:13:40 25:61:00' } }, NY)).toBeNull();
  });

  it('BETA-BULK-1 none: no EXIF date and no creation time gives null (it sorts by its shared date)', () => {
    expect(takenAtFromAsset({}, NY)).toBeNull();
    expect(takenAtFromAsset({ exif: { ...GPS, ...MAKER }, creationTime: null }, NY)).toBeNull();
    expect(takenAtFromAsset({ exif: {}, creationTime: 0 }, NY)).toBeNull();
  });

  it('BETA-BULK-1 privacy: the result is just the date, never GPS or maker data', () => {
    const r = takenAtFromAsset({ exif: { DateTimeOriginal: '2024:07:04 23:15:00', OffsetTimeOriginal: '-04:00', ...GPS, ...MAKER } }, NY);
    expect(typeof r).toBe('string');
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(r).not.toMatch(/35\.22|80\.84|Apple|iPhone/);
  });
});
