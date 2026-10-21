// R15 photo helpers (SPEC-PHOTO-HELPERS): plain image arithmetic on a grayscale thumbnail. No model.
import { blur, dark, edges, img, other, scene, toJpeg } from '../../test/pictures';
import { dHash64, grayFromJpeg, hamming, isDark, meanLuma, nearDuplicateGroups, sharpness } from '../pixels';

describe('R15 HELP-DUP-3 dHash', () => {
  it('HELP-DUP-3 the same picture hashes the same; a slightly brighter copy stays within 6 bits', () => {
    expect(hamming(dHash64(scene()), dHash64(scene()))).toBe(0);
    const base = scene();
    const brighter = img(96, 72, (x, y) => base.data[y * 96 + x]! * 1.08 + 6);
    expect(hamming(dHash64(scene()), dHash64(brighter))).toBeLessThanOrEqual(6);
  });

  it('HELP-DUP-3 a different picture is more than 6 bits away', () => {
    expect(hamming(dHash64(scene()), dHash64(other()))).toBeGreaterThan(6);
  });

  it('HELP-DUP-3 near-duplicates group together and the sharpest of each group is kept', () => {
    const photos = [blur(scene(), 2), scene(), other(), blur(scene(), 1)];
    const groups = nearDuplicateGroups(photos.map((g) => ({ hash: dHash64(g), sharpness: sharpness(g) })));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keep).toBe(1);
    expect([...groups[0]!.setAside].sort()).toEqual([0, 3]);
  });
});

describe('R15 HELP-BLUR sharpness', () => {
  it('HELP-BLUR-1 a blurred copy scores well under the sharp original', () => {
    expect(sharpness(blur(edges(), 4))).toBeLessThan(sharpness(edges()) / 5);
  });

  it('HELP-BLUR-2 a dark photo is recognised as dark (mean under 15%) so it is never called blurry', () => {
    expect(meanLuma(dark())).toBeLessThan(0.15);
    expect(isDark(dark())).toBe(true);
    expect(isDark(scene())).toBe(false);
  });
});

describe('R15 grayFromJpeg', () => {
  it('HELP-DUP-3 a JPEG preview decodes on the phone to the same picture (same hash within 2 bits)', () => {
    const g = grayFromJpeg(toJpeg(scene()));
    expect([g.width, g.height]).toEqual([96, 72]);
    expect(hamming(dHash64(g), dHash64(scene()))).toBeLessThanOrEqual(2);
  });
});
