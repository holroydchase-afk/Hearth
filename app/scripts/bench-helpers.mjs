// Photo-helper cost per photo (PERF-HELP-1, docs/eng/PERFORMANCE.md): decode a 160 px JPEG preview,
// then dHash and sharpness. Run from app/ (Node 22.6+ reads the TypeScript directly):
//   node --experimental-strip-types scripts/bench-helpers.mjs
// For the no-JIT number (closest stand-in for Hermes), strip the types first (node:module
// stripTypeScriptTypes) into a .mjs and run that with node --jitless: type stripping needs WebAssembly.
import jpeg from 'jpeg-js';
import { dHash64, grayFromJpeg, sharpness } from '../src/media/pixels.ts';

const w = 160, h = 120;
const rgba = new Uint8Array(w * h * 4);
for (let i = 0; i < w * h; i++) {
  const x = i % w, y = Math.floor(i / w);
  const v = 128 + 70 * Math.sin(x / 9) * Math.cos(y / 11) + (((x >> 1) + (y >> 1)) % 2 ? 30 : -30);
  rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
}
const file = new Uint8Array(jpeg.encode({ width: w, height: h, data: rgba }, 70).data);
const runs = 50;
const t = performance.now();
for (let r = 0; r < runs; r++) { const g = grayFromJpeg(file); dHash64(g); sharpness(g); }
console.log(`160 px preview, decode + dHash + sharpness: ${((performance.now() - t) / runs).toFixed(1)} ms per photo`);
