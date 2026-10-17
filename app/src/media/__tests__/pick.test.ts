// BETA-BULK-1/2: the bulk picker asks for up to 100 items with EXIF (read on the phone, never sent).
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [
      { uri: 'file:///a.jpg', type: 'image', width: 4032, height: 3024, exif: { DateTimeOriginal: '2024:07:04 08:00:00' } },
      { uri: 'file:///b.mov', type: 'video', width: 1920, height: 1080, duration: 12000 },
    ],
  })),
}));
import * as ImagePicker from 'expo-image-picker';
import { pickBulk, pickPhotos } from '../pick';

describe('BETA-BULK-1 pickBulk', () => {
  it('BETA-BULK-1 asks for up to 100, multiple, with EXIF, photos and videos (so skipped videos can be named)', async () => {
    const r = await pickBulk();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsMultipleSelection: true, selectionLimit: 100, exif: true, mediaTypes: ['images', 'videos'],
    }));
    expect('assets' in r && r.assets.map((a) => a.uri)).toEqual(['file:///a.jpg', 'file:///b.mov']);
  });

  it('BETA-BULK-1 the existing 1-10 photo picker still asks for no EXIF', async () => {
    await pickPhotos();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenLastCalledWith(expect.objectContaining({ exif: false, selectionLimit: 10 }));
  });
});
