# Performance: budgets and measurements

Chase's bar (Oct 21, 2026): "a world class, very fast, very stable product". Measure first, then change, then measure again. Every number here says how it was measured, so anyone can rerun it.

## Budgets

| ID | What | Budget | How it's held | Status |
|---|---|---|---|---|
| PERF-UP-1 | A photo's display and thumbnail upload at the same time | 2 requests in flight per photo | `app/src/upload/__tests__/speed.test.ts` | Met (Oct 21) |
| PERF-UP-2 | Photos of one post upload in parallel, progress counted in order | 2 photos (4 requests) in flight, never more | same | Met (Oct 21) |
| PERF-UP-3 | The next post is resized and encrypted while this one uploads | Prepared once, during the previous upload | same | Met (Oct 21) |
| PERF-ENC-1 | Encrypting one 2048 px display photo (about 500 KB) on a phone | Under 150 ms | Provider choice tested in `app/src/crypto/__tests__/aesGcm.test.ts`; phone check once a development build exists (A1) | Not met in Expo Go: about 370 ms on a laptop with the JIT off, likely 1 to 2 s on an older phone |
| PERF-FEED-1 | Cold start to the first photo on screen | Under 2 s on the web build with the fake backend; under 2 s on a phone over Wi-Fi, under 1 s from the phone's own copy (A3) | `app/e2e-web/perf.spec.js` (median of 3 reloads) | Web + fake: 260 ms median (Oct 21). Phone: not measured yet |
| PERF-PREP-1 | Thumbnail encodes per photo | At most 2 for a busy photo (was up to 7) | `app/src/media/__tests__/pipeline.test.ts` (R12 RV-P5) | Met in tests (Oct 21); phone timing not measured |
| PERF-HELP-1 | Photo helpers per photo: decode the 160 px preview, dHash, sharpness | Under 30 ms | `app/scripts/bench-helpers.mjs` | 3.8 ms with JIT, 30 ms without (Oct 21, laptop). Runs after the review screen shows, so Send never waits; the native preview render is extra and not measured yet |
| PERF-ENC-2/3 | Every AES-GCM provider matches the NIST vector and the JavaScript path byte for byte | Exact | `aesGcm.test.ts` | Met (Oct 21): noble and WebCrypto |
| PERF-DB-1 | `get_timeline` p95 at family size | Under 5 ms | `backend/tests/perf/` | 2 to 5.5 ms on a 2-CPU box (Oct 17); re-measure on hosted (QA-R3) |

## Measurements

### Media encryption (Oct 21, 2026)

`cd app && node scripts/bench-encrypt.mjs` and the same with `node --jitless`. AES-256-GCM in 64 KiB chunks with `@noble/ciphers` 2.1.1, 4-core Intel Xeon at 2.1 GHz, average of 3 runs.

| Size | V8 with JIT (web build in Chrome) | V8 without JIT (stand-in for Hermes on a phone) |
|---|---|---|
| Thumbnail, 40 KB | 9 ms | 31 ms |
| Display, 500 KB | 16 ms | 371 ms |
| Display, 1.5 MB | 41 ms | 1,160 ms |

Reading: on the web the JavaScript cipher is fine. On a phone, where Hermes runs without a JIT, encryption is likely the slowest step of sending a photo. That's why A1 (native AES-GCM in a development build) is approved. Expo Go can't load native modules, so Expo Go keeps the JavaScript path.

### Upload ordering (Oct 21, 2026)

Before (a964c87): per post, every photo was prepared, then each photo's display, then its thumbnail, one request at a time, then the next post started preparing. After (A2): up to 2 photos in flight with display and thumbnail together, and the next post prepares during this post's upload. On a 1-bar LTE link where a request's round trip dominates, a 5-photo post goes from 10 sequential requests to 3 rounds of up to 4.
