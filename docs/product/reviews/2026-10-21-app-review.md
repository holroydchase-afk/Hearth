# App review, Oct 21, 2026 (night shift 1)

Chase lifted the build freeze on Oct 21 (the app is on his phone) and asked for a review, a ranking, then work: "a world class, very fast, very stable product". This review reads the code on `main` at a964c87. The agent types weren't loaded in this session, so Claude worked through each lane in turn using the role files in `.claude/agents/`. Ranked list: `TRACKER.md` "Sequence to milestone 2".

## 1. UI/UX (grandparent-ux lane)

| ID | Screen | Finding | Persona hurt | Suggested fix |
|---|---|---|---|---|
| RV-U1 | Photos card | "Seen by N of M" still shows on your own posts (`screens/PostCard.tsx` PostBody). Chase dropped it Oct 18 (UAT 7, DEC-21): it counts who didn't look (A2) | SG, PA | Stop showing it. Keep the server field for now (no migration) |
| RV-U2 | Photos card, swipe | A post with mixed portrait and landscape photos uses the first photo's shape for every slide and letterboxes the rest (`PhotoSwipe.tsx` `height = width / cardAspect(media[0])`, `fit="contain"`). This is UAT 8 "grey bars like a wide movie" | LG, PA | In the card, fill the frame (cover). The whole photo stays one tap away in the full-screen viewer |
| RV-U3 | Photos header | Up to six full-width buttons (Messages, See events, your name, Check for new photos, Show by date, older-photos cards) come before the first photo; on a small phone the first photo is below the fold | LG, GG | Put Messages and See events side by side; move "Show by date" to the bottom of Photos. Needs a grandparent-ux sketch first |
| RV-U4 | Photos card | Every card shows a full reply box, its readers line and Send, even on posts you only look at. Cards are 2 to 3 screens tall | LG, AG | A "Write something back" button that opens the box (words, no gesture) |
| RV-U5 | Photos card | The heart button reads "Love it" / "You love this"; counts read "3 people love this". Good. No change | | |
| RV-U6 | Sign-in, first run | No create-family screen (UAT 5). Still out of scope for M2 (Mom is invited by Chase) | FA | Keep `family-setup.sh` until M3 |

## 2. Speed and stability (app-engineer lane)

Measured, not guessed (`docs/eng/PERFORMANCE.md`).

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| RV-P1 | Uploads are fully serial: every photo in a post is resized and encrypted before the first byte is sent, then each photo's display and thumbnail go one after the other, then the next post starts (`upload/queue.ts` stepUpload) | Code read; benchmark in PERFORMANCE.md | A2: prepare photo n+1 while photo n uploads, send display and thumbnail together. Keep one post at a time (order and idempotency stay simple) |
| RV-P2 | Encryption runs in plain JavaScript (`@noble/ciphers`). With the JIT off (the closest stand-in for Hermes on a phone), a 500 KB display photo takes about 370 ms on a laptop CPU, 1.5 MB about 1.1 s. An older phone is likely 3 to 5 times slower | `node --jitless` bench, PERFORMANCE.md | A1: native AES-GCM when the app runs in its own build; JS stays the Expo Go fallback |
| RV-P3 | Each card asks the server who will read a reply (`replyReaders`) as soon as it renders, and loads comments per post: one call per card on every feed load (N+1) | `PostCard.tsx` Comments effect | Ask only when the reply box opens (pairs with RV-U4) |
| RV-P4 | Photos is held only in memory: every cold start downloads the feed, grants, thumbnails and photos again; nothing shows offline | `media/cache.ts`, `feed/store.ts` | A3: keep the feed and the encrypted photo files on the phone. Keys at rest need a privacy call (section 3) |
| RV-P5 | The thumbnail loop can encode a photo up to 7 times to hit 40 KB (`media/pipeline.ts`) | Code read | Start from a size guess based on the display JPEG's bytes; measure on a phone first |
| RV-P6 | Decrypted photos live as base64 `data:` strings, up to 60 entries (about 30 MB of strings at 2048 px) | `media/cache.ts` | Lower the cap on old phones, or write decrypted files to the app's cache folder (privacy call) |
| RV-P7 | Video can't be sent at all yet: `prepare.ts` stops every video until location stripping exists on the phone (FLAG-7). So resumable video uploads (A4) can't help anyone today | `media/prepare.ts` | Rank A4 after FLAG-7 |
| RV-S1 | Stability: the upload queue already persists every step and resumes after an app kill (good). A kill during sending restarts that whole post because grants live in memory; fine for photos, painful for big batches | `upload/queue.ts` header | Covered by A2 and A4 later |

## 3. Security (privacy-security lane)

| ID | Finding | Fix |
|---|---|---|
| RV-X1 | S20: `messenger/mlsCrypto.ts` is our own glue around audited libraries, not audited. T8: no RFC 9180 known-answer vectors | Add the vectors as tests (T8), then an outside review before real family chat (M3) |
| RV-X2 | S18: photo keys from the pre-fix Expo Go build were guessable; clear the test bucket before real photos (M2) | Chase step before Mom joins; already in the tracker |
| RV-X3 | S19: no safety numbers in Messages | Spec for M3 |
| RV-X4 | `npm audit --omit=dev`: 62 findings (46 high), all in build tools pulled in by the Expo CLI (node-forge, braces, sprintf-js, uuid < 11.1.1). None ship in the app bundle | Recheck after the next Expo patch release; don't force-upgrade |
| RV-X5 | Secrets scan of all git history (key patterns for Supabase, Resend, B2, AWS, private keys, JWTs): only the AWS documentation example key in a test. Clean | Rerun before the repo goes public (D10) |
| RV-X6 | A3 (offline Photos) needs photo keys on the phone. Today keys never touch disk. Proposal: keep only encrypted photo files on disk, and the keys in the phone's keychain (`expo-secure-store`), wiped on sign-out | Chase's call; logged as a decision to review |

## 4. Product (staff-pm lane)

- M2 is Mom using Hearth with Chase. What hurts her first: slow sending of a batch from her phone (RV-P1, RV-P2), the Seen-by count (RV-U1) and odd photo framing (RV-U2). Offline and instant open (RV-P4) matter more from M3, when grandparents join.
- Test gaps T8, T9 and T10 are cheap and keep the suite honest. Do them early.
- The portfolio pack (README, screenshots, case study) doesn't block any milestone but serves Chase's job search. Rank it right after the M2 speed and UX fixes.
- AI-2 (duplicates) and AI-4 (screenshots and blurry photos) need no model. Spec them now; build after the speed work.
