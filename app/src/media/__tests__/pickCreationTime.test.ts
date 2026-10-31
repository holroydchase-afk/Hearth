// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// BETA-BULK-1 fallback: a photo with no EXIF date (a screenshot, a saved or forwarded photo) gets its
// date from the photo library's creation time, read on the phone. No new permission prompt: we only
// read when the Photos access the picker already asked for is granted. Only a number comes back;
// nothing else from the library is kept.
const assets = [
  { uri: 'file:///dated.jpg', assetId: 'A1', type: 'image', width: 10, height: 10, exif: { DateTimeOriginal: '2024:07:04 08:00:00' } },
  { uri: 'file:///screenshot.png', assetId: 'A2', type: 'image', width: 10, height: 10, exif: {} },
  { uri: 'file:///no-id.jpg', assetId: null, type: 'image', width: 10, height: 10, exif: null },
];
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets })),
}));
jest.mock('expo-media-library/legacy', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, accessPrivileges: 'all' })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getAssetInfoAsync: jest.fn(async (id: string) => ({
    id, creationTime: Date.UTC(2023, 11, 25, 15, 0, 0), location: { latitude: 38.3, longitude: -81.6 }, exif: { GPSLatitude: 38.3 },
  })),
}));
import * as MediaLibrary from 'expo-media-library/legacy';
import { pickBulk } from '../pick';
import { planBatch, type PickedAsset } from '../../share/bulk';

const lib = MediaLibrary as jest.Mocked<typeof MediaLibrary>;
const picked = async () => {
  const r = await pickBulk();
  if (!('assets' in r)) throw new Error('denied');
  return r.assets;
};

beforeEach(() => jest.clearAllMocks());

describe('BETA-BULK-1 fallback: creation time for photos with no EXIF date', () => {
  it('BETA-BULK-1 fallback: a photo with no EXIF date gets the library creation time', async () => {
    const a = await picked();
    expect(a[1]!.creationTime).toBe(Date.UTC(2023, 11, 25, 15, 0, 0));
    const plan = planBatch([a[1]!], { timeZone: 'America/New_York' });
    expect(plan.posts[0]!.takenAt).toBe('2023-12-25T15:00:00.000Z');
  });

  it('BETA-BULK-1 fallback: a photo with an EXIF date never asks the library', async () => {
    await picked();
    expect(lib.getAssetInfoAsync).not.toHaveBeenCalledWith('A1', expect.anything());
    expect(lib.getAssetInfoAsync.mock.calls.map((c) => c[0])).toEqual(['A2']);
  });

  it('BETA-BULK-1 fallback: no asset id means no creation time (null), and the photo is still picked', async () => {
    const a = await picked();
    expect(a[2]!.uri).toBe('file:///no-id.jpg');
    expect(a[2]!.creationTime ?? null).toBeNull();
  });

  it('BETA-BULK-1 fallback: keeps only the number (no location or EXIF from the library)', async () => {
    const a = await picked();
    const keys = Object.keys(a[1]!).sort();
    expect(keys).not.toContain('location');
    expect(JSON.stringify(a[1])).not.toContain('38.3');
  });

  it('BETA-BULK-1 fallback: with library access not granted, no new prompt; taken_at is null and the upload still goes', async () => {
    lib.getPermissionsAsync.mockResolvedValueOnce({ granted: false, accessPrivileges: 'none' } as never);
    const a = await picked();
    expect(lib.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(lib.getAssetInfoAsync).not.toHaveBeenCalled();
    expect(a).toHaveLength(3);
    const plan = planBatch([a[1]!] as PickedAsset[], { timeZone: 'America/New_York' });
    expect(plan.photoCount).toBe(1);
    expect(plan.posts[0]!.takenAt).toBeNull();
  });

  it('BETA-BULK-1 fallback: limited Photos access (iOS "Selected photos") still reads the picked photo', async () => {
    lib.getPermissionsAsync.mockResolvedValueOnce({ granted: false, accessPrivileges: 'limited' } as never);
    const a = await picked();
    expect(a[1]!.creationTime).toBe(Date.UTC(2023, 11, 25, 15, 0, 0));
  });

  it('BETA-BULK-1 fallback: a library error leaves the date null and the pick goes through', async () => {
    lib.getAssetInfoAsync.mockRejectedValueOnce(new Error('no such asset'));
    const a = await picked();
    expect(a).toHaveLength(3);
    expect(a[1]!.creationTime ?? null).toBeNull();
  });

  it('BETA-BULK-1 fallback: the library being unavailable (web) leaves dates null', async () => {
    lib.getPermissionsAsync.mockRejectedValueOnce(new Error('unavailable on web'));
    const a = await picked();
    expect(a).toHaveLength(3);
    expect(a.every((x) => (x.creationTime ?? null) === null)).toBe(true);
  });
});
