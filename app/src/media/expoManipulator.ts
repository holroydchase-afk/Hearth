// expo-image-manipulator (SDK 54 context API) behind the pipeline's Manipulator interface.
// Loading decodes the image with its EXIF orientation applied; saving writes a fresh JPEG with
// no metadata. pipeline.ts verifies that by scanning the output bytes.
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import type { LoadedImage, Manipulator } from './pipeline';

export const expoManipulator: Manipulator = {
  async load(uri: string): Promise<LoadedImage> {
    const ref: ImageRef = await ImageManipulator.manipulate(uri).renderAsync();
    return { width: ref.width, height: ref.height, handle: ref };
  },
  async render(img, size, quality) {
    const ctx = ImageManipulator.manipulate(img.handle as ImageRef);
    if (size.width !== img.width || size.height !== img.height) ctx.resize({ width: size.width, height: size.height });
    const out = await ctx.renderAsync();
    const saved = await out.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    return { uri: saved.uri, width: saved.width, height: saved.height };
  },
};
