// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// R15 HELP-SHOT-1: the photo library says which picks are screenshots (iPhone: the "screenshot"
// subtype; Android: the "Screenshots" album). Read on the phone only, kept as one true/false.
const assets = [
  { uri: 'file:///dated.jpg', assetId: 'A1', type: 'image', mimeType: 'image/jpeg', exif: { DateTimeOriginal: '2024:07:04 08:00:00' } },
  { uri: 'file:///ios-shot.png', assetId: 'A2', type: 'image', mimeType: 'image/png', exif: {} },
  { uri: 'file:///android-shot.png', assetId: 'A3', type: 'image', mimeType: 'image/png', exif: {} },
  { uri: 'file:///saved.jpg', assetId: 'A4', type: 'image', mimeType: 'image/jpeg', exif: {} },
];
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets })),
}));
jest.mock('expo-media-library/legacy', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, accessPrivileges: 'all' })),
  getAlbumAsync: jest.fn(async (name: string) => (name === 'Screenshots' ? { id: 'shots-album' } : null)),
  getAssetInfoAsync: jest.fn(async (id: string) => ({
    id, creationTime: 1_700_000_000_000,
    mediaSubtypes: id === 'A2' ? ['screenshot'] : [],
    albumId: id === 'A3' ? 'shots-album' : 'camera-album',
  })),
}));
import { pickBulk } from '../pick';

const picked = async () => {
  const r = await pickBulk();
  if (!('assets' in r)) throw new Error('denied');
  return r.assets;
};

describe('R15 HELP-SHOT-1 screenshots from the photo library', () => {
  it('HELP-SHOT-1 iPhone subtype and Android Screenshots album mark a screenshot; other photos are not', async () => {
    const a = await picked();
    expect(a.map((x) => !!x.screenshot)).toEqual([false, true, true, false]);
  });

  it('HELP-DUP-1 the library id is carried so the same photo picked twice can be found', async () => {
    const a = await picked();
    expect(a.map((x) => x.assetId)).toEqual(['A1', 'A2', 'A3', 'A4']);
  });
});
