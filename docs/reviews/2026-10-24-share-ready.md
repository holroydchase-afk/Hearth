# Recruiter-share readiness and hardening round 2, Oct 24 (night shift 4)

Goal (tonight.md): Chase can send a recruiter the demo link and the case study today. On a phone in 90 seconds, or on a laptop in 5 minutes, it works, looks finished and tells one true story. Then a second hardening round (IDs from HARD-8; HARD-1..7 are in `2026-10-23-harden.md`).

## The published demo (checked live, Oct 24 06:30Z)
- chaseholroyd.com/demo/hearth/ ran the full showcase sweep (`SHOWCASE_BASE=https://chaseholroyd.com/demo/hearth/`, 390 × 844 and 1280 × 800, light and dark). Every step worked: Photos, by date, Messages, Share and Post, full screen, Groups, Me, Grandma's view, Help. It matches the local build screen for screen. The only differences are the post dates and the unknown-page case below.
- A full-screen photo survives a reload (`viewer?postId=…`). Deep links to /photos, /share, /groups and /me load.
- family-photos.html has "Try the demo", the groups wording and "600+ app tests and 800+ database checks", and doesn't link the repo or the live app. So the Oct 22 INTAKE is shipped.
- Left (P2, portfolio site, no INTAKE yet): an unknown address under /demo/hearth/ shows the site's own 404 ("That page isn't here", with a link to the work page), not the demo's "We couldn't find that page". GitHub Pages has one 404 page per site, so this stays as is.

## Found and fixed

| ID | Area | P | What went wrong | Fix | Test |
|---|---|---|---|---|---|
| RD-1 | Case study | P2 | Said 30 decisions; the log has 37 | Count corrected; a test keeps it true (never over, at most 10 behind) | `portfolioClaims.test.ts` |
| RD-2 | README, case study | P2 | Neither linked the published demo | Both link chaseholroyd.com/demo/hearth/ | `portfolioClaims.test.ts` |
| HARD-8 | Full screen | P1 | A new post arriving while you looked (a refresh) shifted the list, so the photo on screen silently changed | The viewer remembers which photo is shown, not its place in the list; if that photo is removed it says so | `viewer.test.tsx` HARD-8 |
| HARD-10 | Join | P1 | With no signal while opening or joining an invite, it said "We'll keep trying" (nothing did) and offered no retry | Says "When you have signal, tap Try again" with a Try again button, for the preview and the join | `join.test.tsx` HARD-10 |
| HARD-11 | Help / Me | P1 | Picking how to be told about new photos said "Saved." even when the server never got it, so she'd wait for emails that never come | Shows "Saved" only after the server has it; otherwise it goes back to what is really set and says to try again | `notifySync.test.tsx` HARD-11 |
| HARD-9 | Love it | P2 | A quick double tap (common on an old phone) sent both taps at once; the heart could flicker or end up out of step with the server | Taps go to the server one after another, and only the newest tap's answer shows | `store.test.ts` HARD-9 |

## After
Jest 633 + 1 skipped (3 runs), typecheck clean, web e2e 4, demo e2e 9, re-sweep of 48 screens the same as before (the only pixel changes are a text caret and a scroll edge), and the console is empty.
