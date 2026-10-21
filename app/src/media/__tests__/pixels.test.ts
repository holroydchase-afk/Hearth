// R15 photo helpers (SPEC-PHOTO-HELPERS): plain image arithmetic on a grayscale thumbnail. No model.
import { dHash64, hamming, isDark, meanLuma, nearDuplicateGroups, sharpness, type Gray } from '../pixels';

/** A w×h grayscale image from a function of (x, y), values 0..255. */
const img = (w: number, h: number, f: (x: number, y: number) => number): Gray => {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = Math.max(0, Math.min(255, Math.round(f(x, y))));
  return { width: w, height: h, data };
};
// A "scene": smooth shapes plus fine texture (what blur takes away), so a small change keeps its look.
const scene = (shift = 0) => img(96, 72, (x, y) => 128 + 70 * Math.sin((x + shift) / 9) * Math.cos(y / 11) + ((((x + shift) >> 1) + (y >> 1)) % 2 ? 30 : -30));
const other = () => img(96, 72, (x, y) => 128 + 100 * Math.cos(x / 5 + y / 3));
/** 3×3 box blur, applied n times. */
const blur = (g: Gray, n = 3): Gray => {
  let cur = g;
  for (let k = 0; k < n; k++) {
    const src = cur;
    cur = img(src.width, src.height, (x, y) => {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < src.width && yy < src.height) { s += src.data[yy * src.width + xx]!; c++; }
      }
      return s / c;
    });
  }
  return cur;
};
const edges = () => img(96, 72, (x, y) => (((x >> 2) + (y >> 2)) % 2 ? 230 : 25));

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
    const dark = img(96, 72, (x, y) => 10 + ((x + y) % 7));
    expect(meanLuma(dark)).toBeLessThan(0.15);
    expect(isDark(dark)).toBe(true);
    expect(isDark(scene())).toBe(false);
  });
});
