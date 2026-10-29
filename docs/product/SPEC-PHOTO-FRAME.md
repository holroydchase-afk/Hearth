# Spec: the home-screen photo frame (FRAME-*)

Status: specced Oct 29, 2026 (DEC-40; Chase: "Start with 1"). Owner: staff-pm. Not built. Words still need the grandparent-ux lane, and the library choice needs the architect lane. Persona check: `docs/product/decisions/2026-10-29-photo-frame.md`. TRACKER R23.

## Why

STORY problem 3: somebody doesn't get the photo. Grandparents (LG, GG) rarely open apps, and a push they swipe away is gone. A widget on the home screen shows the newest family photo every time they unlock the phone, so seeing the grandkids takes zero taps. It is also the one feature that shows off on a recruiter's phone in two seconds.

## When

It needs a real app build, because Expo Go can't host a widget (same gate as NOTIFY-3, milestone 2). Build it after milestone 2's real build exists and after the M1.1 release. It never blocks a milestone.

## Rules

- **FRAME-R1 Same audience as Photos.** The frame only shows posts this person can already see in Photos. It reads the phone's own cached, already-decrypted feed (A3 photo files, TRACKER R8). It never makes its own server call with different rules.
- **FRAME-R2 No photo while locked.** Lock-screen widgets and notices show words only ("New photos from Chase"), never a photo, caption or child's name (BETA-NOTIFY-2). Photos appear only on the home screen, after unlock.
- **FRAME-R3 Nothing new leaves the phone.** The widget's copy of the photo stays on the phone, in the app's own protected storage, and is wiped on sign out (as HARD-13 does for the feed cache). Push payloads don't change.
- **FRAME-R4 Optional and set up by a helper.** Nothing in the app asks a viewer to add a widget. The printed guide and the inviter's "Set up Grandma's phone" steps cover it, worded so they can be read aloud.
- **FRAME-R5 Android equal.** Android gets the same widget, the same photo quality and the same words (AG).

## Criteria

| ID | Criterion | Test |
|---|---|---|
| FRAME-1 | The home-screen widget shows the newest photo this person can see, with the sender's name under it in 17 pt+ ("From Chase") | Native snapshot test, iPhone and Android |
| FRAME-2 | Tapping anywhere on the widget opens that post in the app (cold and warm start, as NOTIFY-3) | Manual on a phone; deep-link unit test |
| FRAME-3 | The widget updates within 15 minutes of a new post the app has received, and after the app opens | Manual timing on a phone, logged in the Test Log |
| FRAME-4 | A post the person can't see, or that was deleted, never appears; a deleted post leaves the widget at the next newest photo | Unit: widget feed built from the cached feed after a delete |
| FRAME-5 | Sign out empties the widget to "Open Hearth to see photos" | Unit, with HARD-13's sign-out test |
| FRAME-6 | Lock-screen widget shows words only, no photo | Snapshot test |
| FRAME-7 | With no photos yet, the widget says "Photos from your family will show here", never blank | Snapshot test |
| FRAME-8 | Poster's Live Activity (iPhone) while a big send runs: "Sending 48 photos · 12 left", ending at "Sent". Android shows the same as an ongoing notice | Manual on a phone |

FRAME-8 is a change from the first pitch. Apple allows Live Activities only for things in progress, so "Chase shared 4 photos" stays an ordinary push for grandparents. The live progress bar fits the poster's upload instead.

## Open, before the build

1. Architect lane: which widget library or config plugin, checked on the vendor's live page (rule 8), and how the widget reads the app's cached photos on each platform.
2. privacy-security: the widget's photo copy at rest, then `docs/architecture/02-data-flow.md` and `03-encryption-and-keys.md` updated in the build PR (rule 6).
3. grandparent-ux: final words for FRAME-1, 5, 7 and the guide step.
4. GG: Bebar's Aluratek frame stays the path for great-grandparents (milestone 6, CF-18). This widget doesn't replace it.
