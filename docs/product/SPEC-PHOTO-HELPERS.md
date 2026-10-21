# Spec: photo helpers with no AI model (AI-2 duplicates, AI-4 screenshots and blurry photos)

Status: specced Oct 21, 2026 (DEC-29; Chase: "could be specced now"). Owner: staff-pm. Words reviewed by the grandparent-ux lane. Persona check: `docs/product/decisions/2026-10-21-photo-helpers.md`. Build after the M2 speed work (TRACKER R10).

**Build status (Oct 21, TRACKER R15).** Built: HELP-R1, R3, R5, DUP-1, DUP-3, DUP-4, SHOT-1, BLUR-2 and ALL-1. Look-alikes and blur use a 160 px preview made on the phone (`app/src/media/preview.ts`) and decoded in TypeScript (jpeg-js 0.4.4); the lines appear a moment after the review screen opens, and Send never waits for them. BLUR-1 is built but off: `BLUR_UNDER` stays null until the threshold is tuned on a labeled set of 40 photos (needs Chase; the photos stay off the repo). Still to do: DUP-2 (30-day repeats), HELP-R4 server flags (an on/off option exists in code, on by default). Android screenshots are read from the library's "Screenshots" album; a phone that names that album differently isn't caught.

## Why

A parent's bulk pick of 48 photos often carries three near-identical shots, a few screenshots of a pharmacy receipt and two blurry pocket shots. Each one costs the sender upload time and costs a grandparent attention. These helpers use plain image arithmetic on the phone (hashes and a sharpness number). There's no trained model, nothing leaves the phone, and CF-10's "no ML" CI check stays true.

## Rules (all helpers)

- **HELP-R1 Suggest, never delete.** A helper only *sets aside* photos in this send. Nothing is removed from the phone, and every set-aside photo is one labeled button away from coming back.
- **HELP-R2 On the phone only.** Hashes and scores are computed on the phone from the picked file before EXIF stripping, used for this pick, and never sent or stored on the server.
- **HELP-R3 Words, not icons.** Each helper adds at most one line plus one button to the BatchReview screen (BETA-BULK-3). The button is a verb with a word label, at 17 pt and 48 pt. No gesture.
- **HELP-R4 Off-switch.** Each helper sits behind a feature flag (`photo_helpers_duplicates`, `photo_helpers_screens_blur`), default on for posters, never shown to viewers (DEC-18 control model).
- **HELP-R5 Single picks are left alone.** With fewer than 4 photos picked, no helper runs: a person who picked one photo meant that photo.

## AI-2 duplicates

| ID | Criterion | Test |
|---|---|---|
| HELP-DUP-1 | The same library photo picked twice (same asset id, or same file SHA-256) is sent once. Line: "You picked 2 of the same photo. We'll send it once." No button needed | Unit: `share/helpers.test.ts` plans a batch with a repeated asset and gets one item |
| HELP-DUP-2 | A photo this person already sent in the last 30 days (same SHA-256, kept in the phone's upload-queue storage only) is set aside. Line: "3 of these you already sent. [Send them again]" | Unit: queue storage holds hashes; a second pick of the same file shows the line |
| HELP-DUP-3 | Near-duplicates in one pick (64-bit dHash of the 9×8 grayscale thumbnail, Hamming distance ≤ 6) form a group. The sharpest one in each group stays and the others are set aside. Line: "6 photos look almost the same as others. We kept the clearest of each. [Send all of them]" | Unit: fixture pairs with known distances; the group keeps the highest sharpness |
| HELP-DUP-4 | "[Send all of them]" puts every set-aside duplicate back, and the count in "Send 48 photos" updates | Screen test on BatchReview |

## AI-4 screenshots and blurry photos

| ID | Criterion | Test |
|---|---|---|
| HELP-SHOT-1 | Screenshots are set aside: iPhone via the photo library's `screenshot` subtype, Android via the library album "Screenshots" (expo-media-library). Line: "We left out 4 screenshots. [Send them too]" | Unit: picker assets with the subtype or album are flagged |
| HELP-BLUR-1 | Blurry photos are set aside when the sharpness score (variance of the Laplacian on the 480 px grayscale thumbnail) is under a threshold tuned on a labeled set of 40 family photos, at most 1 in 20 sharp photos flagged | Unit on fixtures (sharp, motion blur, pocket shot); a threshold table in this spec once tuned |
| HELP-BLUR-2 | Line: "2 photos look blurry. [Send them too]". A dark photo (mean luminance under 15%) is never called blurry | Unit: dark fixture isn't flagged |
| HELP-ALL-1 | All set-aside lines sit together under the "Send to" line. One "[Show what we left out]" button opens a simple list of the set-aside photos with "Put back" on each | Screen test; grandparent-safe word check (`expectGrandparentSafe`) |

## Engineering notes (for the app-engineer lane)

- Pixels: Expo Go has no pixel API in expo-image-manipulator. Decode the existing 480 px thumbnail JPEG in TypeScript (a small baseline-JPEG decoder; check the vendor page for the version, per rule 8), so it runs in Expo Go and on the web.
- Cost budget: under 30 ms per photo for dHash and sharpness on the thumbnail, measured in `PERFORMANCE.md` (PERF-HELP-1).
- Where: `app/src/share/helpers.ts`, called from `planBatch` (`share/bulk.ts`). It returns `setAside: {reason, items}[]`, which BatchReview renders.

## Not doing

Face or people grouping (AI-1 phase 2, blocked on the AI positioning session), "best smile" (AI-3 later part), and server-side hashing of any kind.
