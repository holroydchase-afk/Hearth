// Media encryption benchmark (docs/eng/PERFORMANCE.md). Run from app/:
//   node scripts/bench-encrypt.mjs            (V8 with its JIT, like Chrome on the web build)
//   node --jitless scripts/bench-encrypt.mjs  (no JIT: the closest laptop stand-in for Hermes on a phone)
import { gcm } from '@noble/ciphers/aes.js';

const key = new Uint8Array(32).fill(7);
const CHUNK = 64 * 1024;
for (const [label, size] of [['thumbnail 40 KB', 40_000], ['display 500 KB', 500_000], ['display 1.5 MB', 1_500_000]]) {
  const pt = new Uint8Array(size).fill(1);
  const runs = 3;
  const t = performance.now();
  for (let r = 0; r < runs; r++) {
    for (let o = 0; o < size; o += CHUNK) gcm(key, new Uint8Array(12)).encrypt(pt.subarray(o, o + CHUNK));
  }
  console.log(`${label}: ${((performance.now() - t) / runs).toFixed(0)} ms`);
}
