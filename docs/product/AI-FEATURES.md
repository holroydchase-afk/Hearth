# AI and smart-photo features tracker

Owned by `staff-pm`. Started Oct 17, 2026 from Chase's ask: "upload a bunch of pictures, identify all the folks, and auto suggest or autoadd to groups", then duplicates, then "general AI + photos small intuitive features, not chat or anything overwhelming. Purely useful things that can probably be achieved with ML approaches as well."

**Nothing here is in `docs/product/BETA-SPEC.md`.** Each item enters the build only through a staff-pm spec with BETA IDs (CLAUDE.md rule 4). New AI and smart-photo ideas are logged here rather than in the `docs/product/ANCHORS.md` ideas log, whose Oct 16 AI rows (best shot, duplicates, onboarding) are carried in below.

## The rules every item is checked against

These come from the anchors and the "Never build" list, not from taste.

| # | Rule | Source |
|---|---|---|
| R1 | **The photo never leaves the phone for AI.** Any model runs on the device. No cloud vision API, no server-side ML. | Never build #3, A3, CLAUDE.md rule 2 |
| R2 | **No model learns from family photos.** Use off-the-shelf models as shipped; nothing is trained or fine-tuned on user content, on the phone or anywhere else. | Never build #2, claims register |
| R3 | **Suggest, never act on audience.** AI may pre-fill a choice; a person confirms it. Sending a photo to the wrong group is a P0 (wrong audience), so no feature silently widens who sees a photo. | A1, BETA-SPEC P0 definition |
| R4 | **Off unless a parent turns it on** for their family space (see Control model), and the words say plainly what happens: "Hearth looks at faces on this phone only. Nothing is sent anywhere." | A1, grandparent-ux rules |
| R5 | **Nothing that measures people.** No "who's in the most photos", no ranking relatives, no resurfacing old photos uninvited. | A2, Never build #8 |
| R6 | **No chat, no captions written for you, no filters.** Small, quiet helpers only. | Chase, Oct 17; Never build list |
| R7 | **Prefer no-ML when it's good enough.** A hash or a date rule beats a model: smaller app, nothing to explain, keeps CF-10 true. | Deep, not wide |

## Control model (Chase, Oct 17, 3:38 am)

"High level of control over AI with like nothing on by default or different user types that don't have AI. Make it optional but still plan to build it. Or like Discord and have your own server."

staff-pm reading, to confirm when we circle back:
- **Each family space is its own "server"** (it already is: every space has its own groups, roles and settings). AI is a space setting, so one family turning it on never affects another.
- **Off by default, everywhere.** A new space has every AI item off. Turning one on is a parent's choice, per feature (duplicates on, faces off is fine).
- **User types.** Owner and parents see the AI settings. Relatives never see them and no AI ever runs on a relative's phone. Any adult can still say "Don't look for my face", which removes them from face grouping in every family they're in.
- **Kids** follow the parents' choice for their space.
- **What this does to the promise.** The claim can become "AI is off unless your family turns it on, and then it runs only on your phone". That is easier to keep true than "no face scanning", and makes option B in the session below the natural fit.
- **"Own server" taken literally** (a family hosting Hearth itself) is a post-milestone-7 question: it would help A3 but costs Chase support time. Logged, not planned.

## Blocking decision: the AI positioning session

Today's promises forbid all of this as written:
- **CF-10** (`docs/product/CORE-FEATURES.md`): "no face scanning, tagging or ML of any kind", enforced by a CI grep for ML/vision dependencies.
- **Claims register** (`docs/product/MARKETING.md`): "No ads, no AI training, **no face scanning**, no trackers" is marked true today.
- **Never build #3** only bans face recognition *on our servers*, so on-device is open there.

The agenda already exists in `docs/product/ANCHORS.md` ("AI positioning session"). staff-pm recommends **option B: on-device only, opt-in**. If Chase picks B: reword CF-10, change the claim to something like "Hearth never sends your photos to AI, and no computer program learns from them", and have `privacy-security` and `marketing` sign off before any face item (AI-1 phase 2) is built. Items marked **no-ML** below don't need this decision.

## Tracker

Status: **Idea** (logged) → **Ready to spec** (decisions made) → **Specced** (BETA IDs exist) → **Built** → **Shipped**. Priority is Chase's order, then effort.

| ID | Feature | What the family sees | Approach | Needs decision B? | Priority | Status |
|---|---|---|---|---|---|---|
| AI-1 | **People → group suggestions** on bulk upload | "These 14 photos have Memaw in them. Send to Memaw's house too?" | Phase 1 no-ML, phase 2 on-device face grouping (below) | Phase 2 only | 1 (Chase) | Idea |
| AI-2 | **Duplicate and near-duplicate catch** | "3 of these look the same. Send just the best one?" | Exact: file hash. Near: perceptual hash (dHash), not a model | No | 2 (Chase) | Idea |
| AI-3 | **Best shot from a burst** | Of 8 near-identical shots, one is pre-picked; tap to swap | On-device sharpness score (no-ML); later eyes-open/smile score | For eyes/smile only | 3 | Idea (Oct 16, ANCHORS) |
| AI-4 | **Leave out screenshots and blurry shots** in bulk upload | "We left out 6 screenshots and 2 blurry photos. Show them" | Screenshots from photo-library metadata; blur from a sharpness score. No-ML | No | 3 | Idea |
| AI-5 | **Group a bulk upload into occasions** | "Looks like 3 days: Jul 4, Jul 5, Jul 6. Make Jul 4 an event?" | Capture-time gaps, read on the phone before EXIF is stripped. No location (Never build #7). No-ML | No | 4 | Idea; builds on the overnight plan's "one post per day" |
| AI-6 | **Upright and right-side-up** | A sideways photo arrives upright | Orientation flag already kept (SHARE-5); a model only for scans with no flag | Model part only | 5 | Idea |
| AI-7 | **Smart onboarding** | Describe the family once, get suggested groups and households | Language model; needs its own privacy review | Yes, and more | Parked | Idea (Oct 16, ANCHORS); conflicts with R6 for now |

### Not doing (with reasons)
- **Captions written by AI, chat, "ask your photos"**: Chase said no chat or anything overwhelming (R6).
- **Search by face or object**: a search box is a weak tool for grandparents, and the overnight plan already covers finding photos with "Jump to year" and "From [person]".
- **"On this day" memories**: Never build #8; painful after a divorce.
- **Auto-enhance and filters**: Chase said no filters.
- **Auto-adding a person to a group from their face**: group membership is the parents' call (`docs/product/SPEC-GROUPS.md` §4). AI only ever suggests an audience for a photo.

## AI-1 detail: people → group suggestions

Chase's ask, broken into two phases so the useful part doesn't wait on the face decision.

**What "auto-add" becomes.** A suggestion that's pre-filled but needs one tap to confirm (R3). Silently widening an audience risks a P0. A later, opt-in setting ("Always add Memaw's house when Memaw is in the photo") can be specced once the suggestions are proven accurate, and it should only ever widen to groups the person in the photo already belongs to.

**Phase 1, no ML (fits today's promises).**
- The review screen in the bulk-upload flow suggests the audience from what Hearth already knows: the last audience used for photos from the same day, and the event that day belongs to (AI-5).
- The parent can tag who's in a batch by tapping names they already have in Hearth ("Who's in these? Memaw, Pawpaw"). Tags map to that person's households and groups, and the suggestion follows.
- Tags are private to the poster's parents unless decided otherwise (A2). Who sees tags is a `privacy-security` question before spec.

**Phase 2, on-device face grouping (needs decision B).**
1. Parent turns on "Find faces on this phone" (R4).
2. On the phone, the app detects faces and groups similar ones together. iOS Vision can find faces; telling faces apart needs a small bundled face-embedding model (Core ML or TensorFlow Lite) and a native module, so it means an Expo dev build, not Expo Go.
3. Hearth shows "Who is this?" with a few face crops; the parent picks a name from the family list or skips. Nothing is named automatically.
4. On the next bulk upload, photos with a named face pre-fill that person's households and groups (R3).
5. Face data (embeddings and names) stays on the phone, encrypted at rest, is never uploaded, and is deleted when the setting is turned off.

**Open questions for phase 2** (go to `privacy-security` first):
- **Children's faces and biometric laws.** Several US states (Illinois BIPA, Texas, Washington) regulate face geometry even when it's processed for the user. On-device-only and never collected by Hearth likely lowers the risk; confirm before building, not after.
- **App size and old phones.** A face model adds several MB and is slow on the oldest phone in the device inventory. Measure on that phone first.
- **Android parity** comes at milestone 5; phase 2 would ship iPhone-first.
- **Can we reuse the phone's own People albums?** Check whether iOS or Android exposes them to third-party apps. If they do, Hearth may not need its own model. (Not checked yet.)

## AI-2 detail: duplicates

- **Exact duplicates:** hash each picked file on the phone; skip any file already queued or already posted by this person (store the hash with the upload queue item, not on the server as metadata until `privacy-security` agrees). Ties to SHARE-4's "no duplicate post" rule.
- **Near duplicates:** a 64-bit perceptual hash (dHash) per photo, compared within one batch. A small distance means "looks the same". Plain image math, no model, so CF-10 stays true.
- **What the family sees:** one line on the review screen with a "Show them" button; the default keeps the sharpest one (AI-3's score) and sets the rest aside, never deletes them from the phone.

## Handoffs (when an item moves to "Ready to spec")

| Agent | Task | Done when |
|---|---|---|
| staff-pm | Run the AI positioning session with Chase | Option A, B or C chosen and logged in ANCHORS.md |
| privacy-security | Data-flow review of AI-1 phase 2 and the tag-visibility question | Written yes or no with conditions |
| marketing | Rewrite the "no face scanning" claim if B is chosen | Claims register updated |
| grandparent-ux | Words for the opt-in screen and the suggestion lines | Reviewed against the 17pt and plain-words rules |
| staff-pm | Spec AI-2 and AI-4 (no-ML, no decision needed) with BETA IDs | Rows in BETA-SPEC or a SPEC file, failing tests named |
