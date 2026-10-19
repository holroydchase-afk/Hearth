# Spec: media policy, location ideas, Live Photos

Owner: staff-pm. Oct 19, 2026. Status: **proposed**, waiting on Chase for D2, D6 and Q1. Source: Chase, Oct 19: "I like the cleaning step but I want to flush it out some more. I also have features in mind around location (cool stuff) can we make them all configurable as in an admin (code level) can modify what's extracted and whether to compress - will the compress work with Live Photos? Make a plan for getting Live Photos built as well".

## Decisions (staff-pm pick on each; Chase can overrule any)
| # | Decision | Pick |
|---|---|---|
| D1 | Where the rules live | One typed, frozen policy object in `app/src/media/policy.ts`. Code-level only: no remote switch, so a hacked server can't turn location on |
| D2 | Location (GPS) in the file | **Strip, always.** Not a "keep" option in the policy type. Extraction only for a future feature, behind a flag (section 2) |
| D3 | Date and time | Extract to Hearth (`taken_at`, as today), strip from the file |
| D4 | Camera, lens, settings, software, Apple MakerNote, XMP, faces/regions, IPTC | Strip. None serves June or Megan; serial numbers and face boxes are risk with no payoff |
| D5 | Orientation | Bake into the pixels, strip the tag (as today) |
| D6 | ICC colour profile | **Keep.** It is colour, not identity; dropping it makes iPhone (Display P3) photos look dull. privacy-security confirms it carries no device ID |
| D7 | Compression in M1 | On: JPEG, 2048 px long edge, quality 0.82, thumb about 40 KB. HEIC and "original" need a native build; not M1 |
| D8 | The current failure (M1) | Our own JS cleaner removes metadata blocks after encode; the check fails only if a "strip" group survives; failures reported by error code |
| D9 | What the server enforces | M1: policy version and file type allowlist. M2: `sign-media` scans the decrypted file header at finalize |
| D10 | Location features | Ideas only (ANCHORS ideas log, Oct 19), with rules. One question to Chase (Q1) |
| D11 | Live Photos in M1 | Still only (BULK-5 unchanged): one clean JPEG, motion dropped |
| D12 | Live Photo motion | Milestone 4, with video, after FLAG-7 proof. Plays in Hearth with a "Play" button. Possible in Expo Go |
| D13 | Save to phone as a real Live Photo | After M4, and only if relatives ask. Needs our own native module, a dev build, and a new random pairing ID |

## 1. Media policy (code-level config)

**Why strip at all** (Chase is unsure). STORY.md, problem 1: "Kids' privacy. Deepfakes, predators, stalkers, AI training, ads → … Location stripped on the phone." The threat model's "location stalker" row depends on it, and so do CLAUDE.md rule 2 and anchor A1. Location stays non-negotiable. Everything else in the policy can be changed by a reviewed code change.

### 1.1 Field groups
| Group | What's in it | M1 | Why |
|---|---|---|---|
| location | GPS IFD, altitude, direction, speed, XMP/IPTC place names | strip | Rule 2; a home or school found from a photo |
| datetime | DateTimeOriginal, offsets, subsec, creation dates | extract → `taken_at` | Timeline (BULK-1). The server clamps it to the share date |
| camera | Make, model, lens, serial numbers, exposure, ISO, flash | strip | Serials fingerprint one phone across families |
| orientation | EXIF Orientation | bake into pixels | The decoder applies it; no tag needed |
| software | Software, HostComputer, editing history | strip | Device and OS fingerprint |
| makernote | Apple MakerNote, incl. Live Photo content ID | strip | Undocumented vendor data; the content ID links our copy to the original in the sender's iCloud |
| xmp | Any XMP packet | strip | Can repeat any of the above, plus edit history |
| icc | Colour profile (APP2 ICC) | keep | Colour accuracy (D6) |
| faces | Apple/MWG face and region boxes (XMP, MakerNote) | strip | Face data; anchor A3 and the no-AI promise |
| other | IPTC (APP13), comments (COM), unknown APPn blocks | strip | Default for anything not named: strip |

Each group is a TypeScript union `'strip' | 'keep' | 'extract'`; `location` is typed `'strip' | 'extract'` so "keep" won't compile. Unknown blocks are always stripped.

### 1.2 Compression
| Setting | M1 | Options (in Expo Go) | Note |
|---|---|---|---|
| on/off | on | on, off | "off" = clean the original. JPEG originals only; a HEIC original can't be cleaned in Expo Go, so it is still re-encoded |
| long edge | 2048 px | any | SEE-5 saves at 2048; grandparents on one bar of LTE |
| quality | 0.82 | 0–1 | |
| format | JPEG | JPEG, PNG, WebP | `expo-image-manipulator` 57.0.21 `SaveFormat` has no HEIC. HEIC needs native code |
| thumb | ~40 KB, max 48 KB | as today | |

### 1.3 The M1 fix (current failure)
Chase's first iPhone photo died in `prepareItem` → `processPhoto`. Leading guess, **unconfirmed**: iOS `UIImage.jpegData` (what `expo-image-manipulator` calls, `ImageManipulatorUtils.swift`) writes a small Exif block, `hasExif` refuses any Exif, and the job fails as non-retryable without a report.
1. After encode, a pure-TS cleaner (`app/src/media/clean.ts`) copies the JPEG segment by segment, keeping only SOI, APP0 (JFIF), APP2 (ICC, if policy keeps it), the image tables and the scan. Everything else is dropped. The same rule applies to PNG chunks.
2. A verifier parses what is left and maps each surviving field to a group. It fails closed **only** if a group marked strip (or extract) is still in the file. The error code is `META_<GROUP>` (e.g. `META_LOCATION`), using the existing `errorReport` rules: the code is sent, never the bytes or a message.
3. When a job fails as non-retryable, the queue sends `errorReport(e, 'upload')`. Today it sends nothing.
4. `exif_stripped: true` stays, and the upload spec gains `meta_policy: <version>`.

### 1.4 Server enforcement (a changed app can't leak quietly)
- **M1, migration + `sign-media`:** refuse an upload whose `meta_policy` is below the minimum (the server's copy, `MEDIA_POLICY_MIN`). Refuse a `mime_type` that isn't on the allowlist (`image/jpeg`; video only when `video_posting` is on, FLAG-4).
- **Extracted fields get their own columns, each with its own check.** `taken_at` is already clamped. There is no location column until a location idea is approved; when one exists, the database refuses a non-null value unless `feature_on(space,'location')`.
- **M2:** at finalize, `sign-media` already holds the item key. It decrypts only the first 64 KB, runs the same verifier (shared test vectors) and refuses to mark the item ready if a strip group is found. This adds no new trust (the server already unwraps keys), but `docs/architecture/02` and `03` must say so. privacy-security reviews it.

### 1.5 How a change is made
- **Who:** a staff-pm call, then a privacy-security review, then Chase's word for any `keep` or `extract`. app-engineer edits only `policy.ts` and bumps `version`.
- **Guard:** MEDIA-6 snapshots the policy. Any change fails CI until the snapshot, the server minimum and the doc table are updated in the same PR.
- **A4:** `scripts/check-media-policy.sh` (run by `test-all.sh`) prints the policy as the table in `docs/architecture/02-data-flow.md` § "What leaves the phone" and fails if they differ. The doc can't claim more than the code does.

### 1.6 Acceptance criteria
| ID | Type | When | Given / When / Then |
|---|---|---|---|
| MEDIA-1 | auto | M1 | **Given** a JPEG with an Exif block holding only ColorSpace and pixel size (what iOS writes), **When** it is cleaned, **Then** the job continues and the output has no APP1. |
| MEDIA-2 | auto | M1 | **Given** fixtures with GPS, MakerNote (incl. content ID), XMP faces, IPTC, COM and serials, **When** they are cleaned, **Then** none survive (checked by group), and ICC survives when the policy keeps it. |
| MEDIA-3 | auto | M1 | **Given** a cleaner stubbed to leave GPS in, **When** the job runs, **Then** it fails `META_LOCATION`, nothing is signed, and one error report with only that code is sent. |
| MEDIA-4 | auto | M1 | **Given** `meta_policy` below the minimum or a mime type not on the allowlist, **When** `sign-media` is asked, **Then** 422 and no rows. |
| MEDIA-5 | auto | M1 | **Given** `policy.ts`, **When** someone sets `location: 'keep'`, **Then** typecheck fails. |
| MEDIA-6 | auto | M1 | **Given** a policy edit, **When** CI runs, **Then** it fails until the snapshot, the server minimum and the `02-data-flow.md` table match. |
| MEDIA-7 | manual | M1 | **Given** Chase's iPhone in Expo Go, **When** he posts the same photo that failed Oct 19, plus a HEIC and a Live Photo, **Then** all 3 publish, and a saved copy run through exiftool shows no GPS, MakerNote or serial (M-09). |
| MEDIA-8 | auto | M2 | **Given** an upload with GPS that is marked `exif_stripped: true`, **When** it is finalized, **Then** `sign-media` refuses it and the item never becomes ready. |

## 2. Location features (ideas only)
Logged in `docs/product/ANCHORS.md` ideas log (Oct 19). Not specced. Any location idea must meet **all** of these rules:
1. Never in the file: location is extracted to its own field and the file is always stripped (D2).
2. Per post, opt-in, off by default. The poster turns it on for that post, with words saying who will see it (G4).
3. Coarse only: city or town ("Charleston, WV"), never coordinates. Rounding to the city happens on the phone; the precise point never leaves it.
4. Place names come from on-device lookup or a US-hosted service that is sent no photo (A3). No Google or Apple Maps calls carrying a child's photo.
5. Behind the family flag (`feature_on(space,'location')`) and checked by the server (1.4).
6. Never in notices, error reports or logs (rule 2).
7. Kids' home and school stay safe: no map of where a child sleeps or studies. privacy-security reviews the threat model before any build.

**Q1 for Chase:** What's the location feature you have in mind? Pick one in a line: a place name on the post, a family trips map, or something else.

## 3. Live Photos
**Will compression work with Live Photos?** Yes for the still, no for the motion in Expo Go:
- **The still:** yes. It is cleaned and shrunk like any photo, which is how BULK-5 works today. But re-encoding drops the MakerNote content ID that pairs it with its video, so the iPhone can no longer treat it as a Live Photo.
- **The video (about 3 s .mov):** not compressible in Expo Go. Nothing in our SDK 57 set transcodes video, and the picker docs say Live Photos come "at original quality, regardless of the `quality` option". We can remove its metadata in place without re-encoding (section 3.3). Real compression needs a native transcode (AVFoundation), so a dev build.
- **Native playback or saving as a Live Photo** needs both halves unaltered or re-paired. `expo-live-photo` says: "the photo and video parts of the live photo must come from a valid live photo file and be unaltered … If the pairing is broken, joining them into a live photo is impossible." So cleaning and native Live Photo playback conflict, unless we write a **new random** pairing ID into both halves (native code).

### 3.1 What I verified (vendor sources, Oct 19)
docs.expo.dev and Apple's pages were not reachable from this sandbox (DNS failure / empty page), so I read the vendor's shipped packages instead:
- `expo-image-picker` 57.0.20 (`build/ImagePicker.types.d.ts`): `MediaType` includes `'livePhotos'` (iOS only, ignored on Android and web, and ignored with `allowsEditing`). The asset `type` can be `'livePhoto'`, and `pairedVideoAsset` holds the video.
- `expo-media-library` 57.0.5: legacy `Asset.mediaSubtypes` includes `'livePhoto'`, and `pairedVideoAsset` is on `AssetInfo`. The new API has `getLivePhotoVideoUri()`. Saving (`SaveToLibraryDelegate.swift`) adds only a `.photo` resource, never `.pairedVideo`, **so it can't save a real Live Photo.**
- `expo-live-photo` 57.0.2 (npm tarball): `LivePhotoView` with `startPlayback('hint'|'full')`, `isAvailable()`, iOS and web. A web search snippet of the SDK 57 docs page says "Included in Expo Go". **Not verified on a phone.**
- Apple pairing (MakerNote key 17 ↔ QuickTime `com.apple.quicktime.content.identifier`, `PHAssetCreationRequest` with `.photo` + `.pairedVideo`): **not verified**; Apple's page returned no body. Confirm before phase L3.

### 3.2 Phases
| Phase | Milestone | Build | What |
|---|---|---|---|
| L0 | M1 | Expo Go | Still only (BULK-5 as is) + MEDIA-7 |
| L1 | M4, with video | Expo Go | Pick with `'livePhotos'`, upload the still + the cleaned .mov as one item, play in Hearth |
| L2 | M4 | Expo Go | Android and web: still only, always |
| L3 | after M4, if asked | Dev build ($99 account, M2+) | Save to phone as a real Live Photo, with a new random pairing ID; optional video compression |

### 3.3 Acceptance criteria
| ID | Type | Phase | Given / When / Then |
|---|---|---|---|
| LIVE-1 | auto | L1 | **Given** a pick that includes a Live Photo, **When** it is planned, **Then** it is one item, kind `live`, with a still and a video; a picker that returns no `pairedVideoAsset` falls back to the still alone. |
| LIVE-2 | auto | L1 | **Given** the .mov half, **When** it is cleaned, **Then** every `meta`/`udta`/`keys` box (location ISO6709, content ID, make, software) is overwritten in place with a `free` box of the same size, and the verifier finds none. |
| LIVE-3 | manual | L1 | **Given** 3 Live Photos from Chase's iPhone, one taken abroad, **When** posted and downloaded, **Then** exiftool shows no location or content ID in either half (shares FLAG-7's proof; video stays off until it passes). |
| LIVE-4 | auto | L1 | **Given** a Live post, **When** shown, **Then** it has a visible "Play" word button (48 pt, 17 pt text); press-and-hold also plays it, and is never the only way (rule 3). |
| LIVE-5 | manual | L1 | **Given** June on an old phone, **When** she sees a Live post, **Then** she plays it within 60 s, unaided. |
| LIVE-6 | auto | L1 | **Given** "Save to phone" on a Live post (L1), **When** tapped, **Then** the still is saved at 2048 px with no location, and the words say "Saved as a photo". |
| LIVE-7 | auto | L2 | **Given** Android or web, **When** a Live post is shown, **Then** the still shows with no Play button and no error. |
| LIVE-8 | manual | L3 | **Given** a dev build, **When** a Live post is saved, **Then** the iPhone Photos app plays it as a Live Photo, and its pairing ID differs from the original's. |

**Storage cost:** a Live item stores a .mov beside each still, probably several times a 2048 px JPEG. Measure on 10 of Chase's Live Photos in L1 before turning it on; the free-tier video cap (`free_video_cap_reached`) should count Live items too.

**Cut:** video compression in Expo Go, HEIC output and full-quality originals are out until a dev build (ideas log).
