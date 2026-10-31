# Spec: media policy, location ideas, Live Photos

Owner: staff-pm. Oct 19, 2026. Status: D2, D6, D7 and the Live Photos plan (D11–D13) **decided by Chase, Oct 19** (persona checks in `docs/product/decisions/2026-10-19-*.md`); the rest proposed. Q1 still open. Source: Chase, Oct 19: "I like the cleaning step but I want to flush it out some more. I also have features in mind around location (cool stuff) can we make them all configurable as in an admin (code level) can modify what's extracted and whether to compress - will the compress work with Live Photos? Make a plan for getting Live Photos built as well".

## Decisions (staff-pm pick on each unless marked Chase's; Chase can overrule any)
| # | Decision | Pick |
|---|---|---|
| D1 | Where the rules live | One typed, frozen policy object in `app/src/media/policy.ts`. Code-level only: no remote switch, so a hacked server can't turn location on |
| D2 | Location (GPS) in the file | **Chase's (Oct 19): a policy value, `strip \| keep \| extract`, default `strip`.** "why do you recommend removing the location? I think we should build the infrastructure and make it configurable". Changing the default needs Chase's word and a persona check (`decisions/2026-10-19-media-location-policy.md`). CLAUDE.md rule 2 ("Strip EXIF/GPS on the device") stays true while the default is `strip`; changing the default amends rule 2 in the same PR. Location features use `extract`, never `keep` (section 2) |
| D3 | Date and time | Extract to Hearth (`taken_at`, as today), strip from the file |
| D4 | Camera, lens, settings, software, Apple MakerNote, XMP, faces/regions, IPTC | Strip. None serves June or Megan; serial numbers and face boxes are risk with no payoff |
| D5 | Orientation | Bake into the pixels, strip the tag (as today) |
| D6 | ICC colour profile | **Chase's (Oct 19): keep, the largest possible** ("keep the colour profile (we want the largest possible)"): the photo's own profile (Display P3 on iPhone), never converted down to sRGB. It is colour, not identity. privacy-security confirms it carries no device ID |
| D7 | Compression in M1 | **Chase's (Oct 19): on for M1**: JPEG, 2048 px long edge, quality 0.82, thumb about 40 KB ("Im fine with compression right now"). **Full size is one policy value** (`long_edge: 'original'`), not more build: its only cost is upload size and time and storage (and slow signal for grandparents; needs its own persona check). **HEIC is more work:** Expo Go can't encode HEIC, so it needs native encoding in a dev build |
| D8 | The current failure (M1) | Our own JS cleaner removes metadata blocks after encode; the check fails only if a "strip" group survives; failures reported by error code |
| D9 | What the server enforces | M1: policy version and file type allowlist. M2: `sign-media` scans the decrypted file header at finalize |
| D10 | Location features | Ideas only (ANCHORS ideas log, Oct 19), with rules. One question to Chase (Q1) |
| D11 | Live Photos in M1 | Still only (BULK-5 unchanged): one clean JPEG, motion dropped. The only phase where the video is not kept |
| D12 | Live Photo motion | **Chase's (Oct 19): build once, never undo** ("I don't want to work we will undo"). From L1 (M4, with video, after FLAG-7 proof) store the still + the cleaned video + a new random Hearth pairing ID, and play through one playback component (`LiveMedia`) with a "Play" button, on iPhone and Android |
| D13 | Real Apple Live Photo view and save | **Chase's (Oct 19): yes, once the $99 account and a dev build exist.** L3 swaps what's inside `LiveMedia` for `expo-live-photo` `LivePhotoView` on iPhone, and writes the stored Hearth pairing ID into both halves on save. Nothing from L1 is thrown away: same storage, same rows, same component |

## 1. Media policy (code-level config)

**Why strip by default.** STORY.md, problem 2: "Kids' privacy. Deepfakes, predators, stalkers, AI training, ads → … Location stripped on the phone." The threat model's "location stalker" row depends on it, and so do CLAUDE.md rule 2 and anchor A1. Chase (Oct 19) wants the infrastructure built and configurable (D2), so location is a policy value like every other group, with the strictest change process: the default stays `strip`, and moving it needs Chase's word, a persona check and a rule 2 amendment. Every other group can be changed by a reviewed code change.

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

Each group is a TypeScript union `'strip' | 'keep' | 'extract'`, `location` included (D2). The default for `location` is pinned by MEDIA-5, so a change is a visible test edit, not a quiet value flip. Unknown blocks are always stripped.

### 1.2 Compression
| Setting | M1 | Options (in Expo Go) | Note |
|---|---|---|---|
| on/off | on | on, off | "off" = clean the original. JPEG originals only; a HEIC original can't be cleaned in Expo Go, so it is still re-encoded |
| long edge | 2048 px | any, or `'original'` (full size, D7) | SEE-5 saves at 2048; grandparents on one bar of LTE |
| quality | 0.82 | 0–1 | |
| format | JPEG | JPEG, PNG, WebP | `expo-image-manipulator` 57.0.21 `SaveFormat` has no HEIC. HEIC needs native code |
| thumb | ~40 KB, max 48 KB | as today | |

### 1.3 The M1 fix (current failure)
Chase's first iPhone photo died in `prepareItem` → `processPhoto`. Leading guess, **unconfirmed**: iOS `UIImage.jpegData` (what `expo-image-manipulator` calls, `ImageManipulatorUtils.swift`) writes a small Exif block, `hasExif` refuses any Exif, and the job fails as non-retryable without a report.
1. After encode, a pure-TS cleaner (`app/src/media/clean.ts`) copies the JPEG segment by segment, keeping only SOI, APP0 (JFIF), APP2 (ICC, if policy keeps it), the image tables and the scan. Everything else is dropped. The same rule applies to PNG chunks.
2. A verifier parses what is left and maps each surviving field to a group. It fails closed **only** if a group marked strip (or extract) is still in the file. The error code is `META_<GROUP>` (e.g. `META_LOCATION`), using the existing `errorReport` rules: the code is sent, never the bytes or a message.
3. When a job fails as non-retryable, the queue sends `errorReport(e, 'upload')`. Today it sends nothing.
4. `exif_stripped: true` stays, and the upload spec gains `meta_policy: <version>` (not built: MEDIA-4).

**Status (Oct 19):** steps 1-3 built for JPEG (`clean.ts`, `policy.ts`, `pipeline.ts`, queue report). PNG chunks are not cleaned: the pipeline only makes JPEG, and anything it can't parse fails closed (`EXIF`). APP14 (Adobe) is stripped as `other`. `compression.enabled: false` is refused until "clean the original" is built. Confirming the cause on a phone is MEDIA-7.

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
| MEDIA-1 | auto | M1 · **Built Oct 19** | **Given** a JPEG with an Exif block holding only ColorSpace and pixel size (what iOS writes), **When** it is cleaned, **Then** the job continues and the output has no APP1. |
| MEDIA-2 | auto | M1 · **Built Oct 19** | **Given** fixtures with GPS, MakerNote (incl. content ID), XMP faces, IPTC, COM and serials, **When** they are cleaned, **Then** none survive (checked by group), and ICC survives when the policy keeps it. |
| MEDIA-3 | auto | M1 · **Built Oct 19** | **Given** a cleaner stubbed to leave GPS in, **When** the job runs, **Then** it fails `META_LOCATION`, nothing is signed, and one error report with only that code is sent. |
| MEDIA-4 | auto | M1 | **Given** `meta_policy` below the minimum or a mime type not on the allowlist, **When** `sign-media` is asked, **Then** 422 and no rows. |
| MEDIA-5 | auto | M1 · **Built Oct 19** (snapshot/CI guard is MEDIA-6, not built) | **Given** `policy.ts`, **When** `location` is set to anything but `'strip'`, **Then** the test titled "MEDIA-5 D2 location default is strip (Chase's word + persona check to change)" fails, and CI stays red until that test, the MEDIA-6 snapshot, CLAUDE.md rule 2 and a new file in `docs/product/decisions/` change in the same PR. **And** `'keep'` and `'extract'` both compile, so the infrastructure exists. |
| MEDIA-6 | auto | M1 | **Given** a policy edit, **When** CI runs, **Then** it fails until the snapshot, the server minimum and the `02-data-flow.md` table match. |
| MEDIA-7 | manual | M1 | **Given** Chase's iPhone in Expo Go, **When** he posts the same photo that failed Oct 19, plus a HEIC and a Live Photo, **Then** all 3 publish, and a saved copy run through exiftool shows no GPS, MakerNote or serial (M-09). |
| MEDIA-8 | auto | M2 | **Given** an upload with GPS that is marked `exif_stripped: true`, **When** it is finalized, **Then** `sign-media` refuses it and the item never becomes ready. |

## 2. Location features (ideas only)
Logged in `docs/product/ANCHORS.md` ideas log (Oct 19). Not specced. Any location idea must meet **all** of these rules:
1. Never in the file: a location feature uses `extract` (its own field) and the file is stripped. `keep` is only for a Chase-approved change of the default (D2), never for a feature.
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
- **So, from L1 (Chase, Oct 19: "I don't want to work we will undo"):** we keep both halves and our own random pairing ID from the first Live upload, and every screen plays Live items through one component. L3 then changes only what's inside that component and adds the re-pairing on save. Apple's own content ID is still stripped (it links our copy to the sender's iCloud); the Hearth ID is new and random.

### 3.1 What I verified (vendor sources, Oct 19)
docs.expo.dev and Apple's pages were not reachable from this sandbox (DNS failure / empty page), so I read the vendor's shipped packages instead:
- `expo-image-picker` 57.0.20 (`build/ImagePicker.types.d.ts`): `MediaType` includes `'livePhotos'` (iOS only, ignored on Android and web, and ignored with `allowsEditing`). The asset `type` can be `'livePhoto'`, and `pairedVideoAsset` holds the video.
- `expo-media-library` 57.0.5: legacy `Asset.mediaSubtypes` includes `'livePhoto'`, and `pairedVideoAsset` is on `AssetInfo`. The new API has `getLivePhotoVideoUri()`. Saving (`SaveToLibraryDelegate.swift`) adds only a `.photo` resource, never `.pairedVideo`, **so it can't save a real Live Photo.**
- `expo-live-photo` 57.0.2 (npm tarball): `LivePhotoView` with `startPlayback('hint'|'full')`, `isAvailable()`, iOS and web. A web search snippet of the SDK 57 docs page says "Included in Expo Go". **Not verified on a phone.**
- Apple pairing (MakerNote key 17 ↔ QuickTime `com.apple.quicktime.content.identifier`, `PHAssetCreationRequest` with `.photo` + `.pairedVideo`): **not verified**; Apple's page returned no body. Confirm before phase L3.

### 3.2 Phases
Each phase adds to the last; none replaces stored data or a screen.

| Phase | Milestone | Build | What | Kept by later phases |
|---|---|---|---|---|
| L0 | M1 | Expo Go | Still only (BULK-5 as is) + MEDIA-7 | The still pipeline |
| L1 | M4, with video | Expo Go | Pick with `'livePhotos'`. One item, kind `live`: the cleaned still + the cleaned .mov + `live_pair_id` (new random UUID, stored on the item). Every screen shows it through `LiveMedia`, which today shows the still and plays the .mov with a "Play" button | Storage layout, `live_pair_id`, `LiveMedia` and its props |
| L2 | M4 | Expo Go | Android and web: the same `LiveMedia` plays the stored .mov with the same "Play" button (picking a Live Photo is iPhone-only; viewing isn't) | Same |
| L3 | when the $99 account and a dev build exist (M2+) | Dev build | Inside `LiveMedia` on iPhone, swap the player for `expo-live-photo` `LivePhotoView` (press, or the "Play" button, plays it the Apple way). "Save to phone" writes `live_pair_id` into both halves (MakerNote key 17 and the QuickTime content identifier) and saves `.photo` + `.pairedVideo`, so Photos treats it as a Live Photo. Optional video compression | Everything; no migration, no re-upload |

### 3.3 Acceptance criteria
| ID | Type | Phase | Given / When / Then |
|---|---|---|---|
| LIVE-1 | auto | L1 | **Given** a pick that includes a Live Photo, **When** it is planned, **Then** it is one item, kind `live`, with a still, a video and a `live_pair_id` that is a new random UUID (never Apple's content ID); a picker that returns no `pairedVideoAsset` falls back to the still alone. |
| LIVE-9 | auto | L1 | **Given** any screen that shows a Live item, **When** the code is scanned, **Then** it renders `LiveMedia` and nothing else touches the .mov directly, so L3 changes one component (Chase's "no rework"). |
| LIVE-2 | auto | L1 | **Given** the .mov half, **When** it is cleaned, **Then** every `meta`/`udta`/`keys` box (location ISO6709, content ID, make, software) is overwritten in place with a `free` box of the same size, and the verifier finds none. |
| LIVE-3 | manual | L1 | **Given** 3 Live Photos from Chase's iPhone, one taken abroad, **When** posted and downloaded, **Then** exiftool shows no location or content ID in either half (shares FLAG-7's proof; video stays off until it passes). |
| LIVE-4 | auto | L1 | **Given** a Live post, **When** shown, **Then** it has a visible "Play" word button (48 pt, 17 pt text); press-and-hold also plays it, and is never the only way (rule 3). |
| LIVE-5 | manual | L1 | **Given** June on an old phone, **When** she sees a Live post, **Then** she plays it within 60 s, unaided. |
| LIVE-6 | auto | L1 | **Given** "Save to phone" on a Live post (L1), **When** tapped, **Then** the still is saved at 2048 px with no location, and the words say "Saved as a photo". |
| LIVE-7 | auto | L2 | **Given** Android or web, **When** a Live post is shown, **Then** the still shows with the same "Play" word button, and it plays the stored video (persona check: the Android grandpa gets what the iPhone relatives get). |
| LIVE-8 | manual | L3 | **Given** a dev build, **When** a Live post is saved, **Then** the iPhone Photos app plays it as a Live Photo, and its pairing ID is the item's `live_pair_id`, not the original's. |
| LIVE-10 | manual | L3 | **Given** a dev build and Live items posted in L1, **When** they are viewed on an iPhone, **Then** they play in Apple's Live Photo view with no re-upload, no migration and the "Play" button still there. |

**Storage cost:** a Live item stores a .mov beside each still, probably several times a 2048 px JPEG. Measure on 10 of Chase's Live Photos in L1 before turning it on; the free-tier video cap (`free_video_cap_reached`) should count Live items too.

**Cut:** video compression in Expo Go and HEIC output are out until a dev build (ideas log). Full-quality originals are not cut by the build, only by size: one policy value (D7), with its own persona check before it's turned on.

## 4. Video (FLAG-7, built Oct 29)
**What changed.** BETA-SPEC said iOS video location "can't be stripped without a transcoder". That was too strong: the location sits in metadata boxes, not in the picture, so it can be removed by rewriting boxes, in TypeScript, in Expo Go. `app/src/media/cleanVideo.ts` does that; nothing is re-encoded by us.

**How.** On iPhone the picker re-encodes the pick to 720p H.264 MP4 first (`videoExportPreset: H264_1280x720`, Apple's AVAssetExportSession inside expo-image-picker 58.0.10; BETA-SHARE-6's 720p). Android hands over the camera file. Then `cleanVideo` keeps `ftyp`, and in `moov` only `mvhd`, the picture (`vide`) and sound (`soun`) tracks and, in each, `tkhd`, `edts`, `mdia` (`mdhd`, `hdlr`, `minf`: `vmhd`/`smhd`, `hdlr`, `dinf`, `stbl` with its sample tables). Every other box (`udta` with `©xyz`, make, model, software; `meta` with `com.apple.quicktime.location.ISO6709`; `uuid` XMP; `loci`; unknown) becomes a zero-filled `free` box of the same size, so no offset moves. A track that isn't picture or sound (timed metadata, which is how GoPro and drones store GPS; timecode; text) is freed and its samples in `mdat` are zeroed through its own tables. Creation and change dates in `mvhd`, `tkhd`, `mdhd`, and the vendor and compressor name in each sample description, are zeroed. Bytes after the last box (Samsung's SEF trailer) are zeroed. `verifyVideoClean` then fails closed: `META_LOCATION`, `META_DATETIME`, `META_SOFTWARE`, `META_OTHER`; an unreadable file is `EXIF`.

**Left inside on purpose.** The picture and sound samples, byte for byte. A video encoded by software that writes text into the picture stream itself (x264's settings banner) keeps it; phone cameras and Apple's exporter don't write one. Size: the whole file is read into memory once and copied once (about 2 × 40 MB for 60 s at 720p).

**Not built yet (TRACKER R27):** the poster frame (thumbnail), the player on Photos, words from grandparent-ux, the manual FLAG-7 check (a real iPhone and Android video, posted and downloaded, through exiftool), then turning `video_posting` on. Live Photo motion (L1) reuses this cleaner.

| ID | Type | Given / When / Then |
|---|---|---|
| VID-1..4 | auto · **Built Oct 29** | **Given** iPhone-like and Android-like files (moov first or last, 64-bit offsets, a Samsung trailer, a timed-metadata track), **When** cleaned, **Then** no location, make, model, software, XMP, face box, timecode or date survives anywhere in the file, the length is unchanged and the picture and sound samples are byte-identical where the tables point. |
| VID-5, 11 | auto · **Built Oct 29** | **Given** a file with a location box, a date, a vendor name or an unknown box left, **When** verified, **Then** `META_LOCATION`, `META_DATETIME`, `META_SOFTWARE` or `META_OTHER`. |
| VID-6, 7 | auto · **Built Oct 29** | **Given** a non-video, no `moov`, two `moov`s, a cut-short `mdat` or a sample table pointing outside the file, **When** cleaned, **Then** `EXIF`, never a pass-through. |
| VID-8..10 | auto · **Built Oct 29** | Input unchanged and cleaning is idempotent; the mime type comes from the file's brand; two real ffmpeg-made files (`app/src/test/fixtures/`) come out clean and still decode (ffprobe and a full ffmpeg decode, by hand, Oct 29; how: `app/src/test/fixtures/README.md`). |
| VID-12, 13 | auto · **Built Oct 29** | `processVideo` checks the 60 s limit before reading, cleans and verifies; the picker asks iPhone for 720p H.264 when videos are offered. |
| FLAG-7 | manual | **Given** a video from Chase's iPhone (location on) and one from an Android phone, **When** posted and downloaded, **Then** exiftool shows no location, make, model or date. Needs the poster frame and player first. |

