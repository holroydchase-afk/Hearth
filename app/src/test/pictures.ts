// Synthetic grayscale pictures for the photo-helper tests (R15). No real photos.
import { encode } from 'jpeg-js';
import type { Gray } from '../media/pixels';

/** A w×h grayscale image from a function of (x, y), values clamped to 0..255. */
export const img = (w: number, h: number, f: (x: number, y: number) => number): Gray => {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = Math.max(0, Math.min(255, Math.round(f(x, y))));
  return { width: w, height: h, data };
};
/** A "scene": smooth shapes plus fine texture (what blur takes away), so a small change keeps its look. */
export const scene = (shift = 0) => img(96, 72, (x, y) => 128 + 70 * Math.sin((x + shift) / 9) * Math.cos(y / 11) + ((((x + shift) >> 1) + (y >> 1)) % 2 ? 30 : -30));
export const other = () => img(96, 72, (x, y) => 128 + 100 * Math.cos(x / 5 + y / 3));
export const edges = () => img(96, 72, (x, y) => (((x >> 2) + (y >> 2)) % 2 ? 230 : 25));
export const dark = () => img(96, 72, (x, y) => 10 + ((x + y) % 7));
/** 3×3 box blur, applied n times. */
export const blur = (g: Gray, n = 3): Gray => {
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
/** The picture as a JPEG file (what a rendered preview looks like). */
export const toJpeg = (g: Gray, quality = 90): Uint8Array => {
  const rgba = new Uint8Array(g.width * g.height * 4);
  for (let i = 0; i < g.data.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g.data[i]!; rgba[i * 4 + 3] = 255; }
  return new Uint8Array(encode({ width: g.width, height: g.height, data: rgba }, quality).data);
};
