# Recruiter-ready review, Oct 22, 2026

Sprint v2 from Product Studio (Chase approved Oct 22). **Bar:** a recruiter or hiring manager opens Hearth from chaseholroyd.com and it works, looks finished, and tells one clear, true story in under 2 minutes, on phone and laptop, with sample data and no login.

Reviewers: `ux-reviewer` (showcase review mode, synced from studio-agents in PR #37), `qa-tdd`, triage by `staff-pm`. Each round updates the status table at the bottom.

## How it was checked

- **Build:** the app's web export on the in-memory fake backend (`npm run export:web:fake`), served locally. No real backend, no real people.
- **Screenshots:** `app/e2e-web/showcase.spec.js` walks 15 screens at 390×844 (phone) and 1280×800 (laptop), light and dark, viewport and full page (120 files), and logs console errors and failed requests. Every screen was opened and looked at (contact sheets per size and scheme).
- **Personas:** Bebar (95, Hearth's least tech-savvy relative), a recruiter on a phone with 90 seconds, a hiring manager on a laptop with 5 minutes.
- **One story:** the portfolio page (`family-photos.html` in the portfolio repo, read from GitHub at commit on `main`, Oct 22; the live site itself was blocked by this session's network policy, so it is unverified live), the README, `docs/portfolio/CASE-STUDY.md`, `docs/portfolio/screens/`, the INTAKE in PR #36 and `TRACKER.md`.
- **QA:** Jest 3×, typecheck, `test-all.sh` 3×, web e2e 3×, backend SQL 3× (local Postgres 16), README and case-study link crawl.

## Baseline (round 0)

- Console errors and failed requests: none on any screen, any size, either scheme.
- Jest: 596 passed, 1 skipped, 3 of 3 runs. Typecheck clean. Web e2e: 4 of 4, 3 of 3 runs. Prototype e2e 33 of 33, 3 runs. No flakes seen.
- Backend SQL (`backend/tests/run.sh`): 17 suites green; 828 database checks (807 in the 11 main suites plus AUD-16 and GRP-1), plus setup, sent-vs-received and smoke-check script tests.
- Deno tests (edge functions): not run here, Deno isn't installed in this sandbox; they run in CI.
- Links: every relative link in the README and case study resolves. No TODO, "coming soon" or lorem in either.

## Findings, ranked

P0 blocks showing it. P1 hurts the impression. P2 is polish.

| ID | Pri | Where | Problem | Acceptance criteria |
|---|---|---|---|---|
| RR-1 | P0 | Whole demo | There is no no-login demo. The only public web build (expo.app) is the live app on the family's real backend and shows a sign-in screen. The fake-backend build also opens on sign-in and needs a code nobody outside knows (123456). A recruiter stops here. | A demo build (`EXPO_PUBLIC_HEARTH_DEMO=1`) opens straight into Photos as the sample parent: no email, no code. Test DEMO-1. |
| RR-2 | P0 | Photos, first screen | The sample family has no photos: "Nothing shared yet. Tap Share to send your first photos." Nothing shows what the app is for. | The demo opens on 6+ sample posts over the past weeks, with pictures, hearts and replies from the grandparents. Test DEMO-2. |
| RR-3 | P0 | Every screen | Nothing says the data is sample data, and there is no way back to chaseholroyd.com. | A demo bar on every screen: "Sample family. Made-up names. Nothing leaves your browser.", a "Start over" button and a link back to https://chaseholroyd.com/family-photos.html. Test DEMO-3. |
| RR-4 | P0 | Portfolio page vs repo | Two stories. The page says "Groups and households" and "600+ backend checks and 340 app tests"; the case study says the household tree was dropped for plain groups, and the repo has 596 app tests and 828 database checks (README says 639). The INTAKE in PR #36 says "seven specialist agents"; there are now eight. | README, case study and a new INTAKE agree on: plain named groups, 596 app tests, 828 database checks, eight agents, beta late November. Portfolio-page fixes go to Product Studio as an INTAKE (Hearth never edits that repo). |
| RR-5 | P0 | Hosting | The demo can't be hosted as-is. The portfolio serves demos as static snapshots (Role Radar lives at chaseholroyd.com/demo/role-radar/), which needs a base path and pages that load without a server-side fallback. | `app/scripts/build-demo.sh` exports the demo with base path `/demo/hearth`, adds an `index.html` per route, and a test serves it with no fallback and loads `/demo/hearth/photos` cold. Test DEMO-5. |
| RR-6 | P1 | Laptop, every screen | At 1280 px the app stretches edge to edge: buttons 1,250 px wide, tiny-looking text in a sea of white, photos 900 px tall. Looks unfinished on the hiring manager's laptop. | At 900 px and wider the demo shows the app in a phone-width column (430 px) beside a short panel: what Hearth is, who it's for, three things to try. Test DEMO-6. |
| RR-7 | P1 | Unknown link | A mistyped or stale link shows Expo's developer page, "Unmatched Route … Sitemap", in black. | A plain screen: "We couldn't find that page." with a "Go to Photos" button. Test NF-1. |
| RR-8 | P1 | Me | "For testing: how fast notices reach this phone. Show notice timing" is an internal tool on a public screen. | Hidden in the demo build. Test DEMO-8. |
| RR-9 | P1 | Photos, screenshots | The sample photo is a rainbow test gradient, in the app and in every portfolio screenshot. | Illustrated sample pictures (no people, no real places) in the demo; `docs/portfolio/screens/` re-shot from the demo. |
| RR-10 | P1 | Story | The core idea (each photo goes only to the people you pick) is only visible by signing out, opening an invite and typing a code as Grandma. Nobody will do that in 2 minutes. | One tap in the demo bar: "See Grandma Jo's view" / "Back to the parent's view". Grandma sees only posts shared with her groups. Test DEMO-10. |
| RR-11 | P1 | Groups | The Everyone card says "To invite someone, use their household below." The demo family has no households, and the story is plain groups. Dead end. | grandparent-ux words for plain groups (decision to review). |
| RR-12 | P1 | README | Says seven agents (now eight with ux-reviewer) and 639 database checks (now 828). No demo link. | README matches the repo on Oct 22 and names how to run the demo; link the hosted demo once Product Studio publishes it. |
| RR-13 | P2 | QA | `test-all.sh` exits 0 when the backend SQL suite can't run (no Postgres) or Deno is missing; only Playwright decides the exit code. A green run can hide skipped suites. It also overwrites tracked files in `e2e/results/`. | `test-all.sh` exits non-zero if any suite that ran failed, and prints "SKIPPED: <suite> (<why>)" for suites that couldn't run. Test QA-ALL-1. |
| RR-14 | P2 | Demo flows | No automated check of the demo flows a visitor will try: add a photo, edit (heart, reply, rename a group), reload, start over. | e2e `demo.spec.js` covers add, edit, reload and start over. |
| RR-15 | P2 | Full-screen photo | On a static host, reloading `/viewer/<id>` 404s (dynamic route, no fallback). | Reloading a viewer link in the demo lands on Photos instead of a 404. |
| RR-16 | P2 | Sign-in, Share | Disabled "Send me a code" and "Post" buttons are pale with light text (exempt from WCAG contrast as disabled, but a grandparent may not know why they can't tap). Share already says "Pick who should see it." | Confirm with a real user; no change in the demo, which skips sign-in. |

**Checked and fine:** dark mode on every screen (no white flashes, readable text); 17 pt+ text and 48 pt targets on the phone screens (from the theme and the kit; inferred from code and screenshots, not measured per element); no console errors; no example.com links in the README or case study; names in the sample family are made up.

## Decisions to review (Chase)

1. **Where the demo lives:** a static snapshot at chaseholroyd.com/demo/hearth/, like Role Radar, published by Product Studio from an INTAKE. Hearth builds it; nothing is deployed from here.
2. **Demo only:** the laptop frame, the demo bar and hiding "notice timing" apply to the demo build only. The real app's web build (account B) is unchanged.
3. **Sample parent's name:** the demo parent is "Sam", not Chase, so no real person appears in sample data. Help's "Call Sam" uses a 555 number.
4. **Sample pictures** are flat illustrations drawn by `app/scripts/make-demo-pictures.py` (pumpkins, beach, cake…), not stock photos: no licensing, no people.
5. **RR-11** (household words on the Groups screen) needs a grandparent-ux pass; left for the next round rather than guessed.

## Round 1a: what changed

- **Demo build** (`npm run export:web:demo`, `EXPO_PUBLIC_HEARTH_DEMO=1`): opens on Photos as "Sam", a parent, with 7 sample posts over 24 days (8 drawn pictures in `app/public/demo-pictures/`, hearts and replies from the grandparents). Pictures are encrypted into the fake backend the same way an upload is, so the viewer path is the real one. Saved in the browser only after the family is complete.
- **Demo bar** on every screen: "A demo with a made-up family, kept in this browser. You're Sam, a parent." with Grandma's view / Parent's view, Start over (clears only `hearth.*` keys; the portfolio origin hosts other demos) and Portfolio (chaseholroyd.com/family-photos.html).
- **Me screen in the demo** hides notice timing, problem details, sign out and delete account.
- Tests: `src/demo/__tests__/seed.test.ts` (DEMO-1, 2, 3, 10), `demoBar.test.tsx`, `screens/__tests__/demoMe.test.tsx` (DEMO-8), `e2e-web/demo.spec.js` (3 flows, `npm run e2e:demo`).
- Re-checked by eye: phone light (parent) and dark (Grandma Jo). The bar's buttons wrap to two lines at 390 px; readable, 48 px tall.

## Round 1b: laptop frame and not-found (#40)

- **RR-6:** at 900 px and wider the demo shows the app in a 430 px column beside a panel: "A private photo app for split families", one line on what it does, three things to try, and "Built test-first by Chase Holroyd… The family here is made up." No test counts in the app, so it can't go stale.
- **RR-7:** `src/app/+not-found.tsx`: "We couldn't find that page. The link may be old or mistyped. Your photos are safe." and "Go to Photos". In every build, not just the demo.
- Tests: `demoFrame.test.tsx` (DEMO-6), `notFound.test.tsx` (NF-1), e2e `demo.spec.js` DEMO-6 / NF-1. Re-checked by eye: laptop light, not-found on phone dark.

## Round 1c: hosting build (#41)

- **RR-5:** `bash app/scripts/build-demo.sh` (or `npm run build:demo-site`) exports the demo for `/demo/hearth/` into `app/dist-demo-site/` and copies `index.html` into each tab's folder so a reload works on a static host. `app/app.config.js` adds only `experiments.baseUrl` when `HEARTH_BASE_URL` is set; without it the config is `app.json` unchanged (EAS check 12/12, Expo Go check OK).
- `app/scripts/serve-static.js` mimics GitHub Pages (no fallback, slash redirect, 404). `e2e-web/site.spec.js` (DEMO-5): a cold load of `/demo/hearth/`, `/photos`, `/share`, `/groups`, `/me`, pictures drawn, no 4xx, links stay under the demo or go to chaseholroyd.com, Grandma's view and Start over stay under the path. 7/7.
- Still open (RR-15, P2): reloading a full-screen photo's address (`/viewer/<id>`) hits the host's 404.

## Round 1d: one story (#42)

- **RR-4 / RR-12:** README and case study now say 600+ app tests and 800+ database checks (rounded, so they don't go stale with each PR), eight agents, and how to build and run the demo. The README screenshots come from the demo.
- **RR-9:** `docs/portfolio/screens/` re-shot from the demo by `e2e-web/demo-screens.spec.js` (7 phone screens with the demo bar hidden, plus `laptop-01-demo.png` with it). The old rainbow-gradient shots are gone.
- **RR-4 (portfolio page):** `docs/portfolio/INTAKE-2026-10-22-demo.md` for Product Studio: host the demo at /demo/hearth/, add "Try the demo", fix "Groups and households" and the test counts, new screenshots. It replaces the INTAKE in PR #36. RR-4 stays open until Product Studio ships it.

## Status

| Round | Fixed | New | Left |
|---|---|---|---|
| 0 (baseline) | – | RR-1..RR-16 | P0: 5, P1: 7, P2: 4 |
| 1a (demo mode, #39) | RR-1, RR-2, RR-3, RR-8, RR-9 (in the demo), RR-10, RR-14 | – | P0: RR-4, RR-5. P1: RR-6, RR-7, RR-9 (portfolio screenshots), RR-11, RR-12. P2: RR-13, RR-15, RR-16 |
| 1b (#40) | RR-6, RR-7 | – | P0: RR-4, RR-5. P1: RR-9 (portfolio screenshots), RR-11, RR-12. P2: RR-13, RR-15, RR-16 |
| 1c (#41) | RR-5 | – | P0: RR-4. P1: RR-9 (portfolio screenshots), RR-11, RR-12. P2: RR-13, RR-15, RR-16 |
| 1d (#42) | RR-9, RR-12; RR-4 on Hearth's side | – | P0: RR-4 (waits on Product Studio). P1: RR-11. P2: RR-13, RR-15, RR-16 |
