INTAKE for Product Studio (from Hearth, Oct 22, 2026, recruiter-ready sprint). Replaces INTAKE-2026-10-22.md.

Repo: holroydchase-afk.github.io (portfolio). Page: family-photos.html (`family = product(...)` in tools/build.py). Owner: Product Studio. Keep the placeholder name and "name coming"; the name isn't final.

1. Host the no-login demo at chaseholroyd.com/demo/hearth/ (like demo/role-radar/).
   - Build it from the Hearth repo (private; add holroydchase-afk/Hearth to the session), on Hearth's main once its PRs #37 to #42 are merged:
     cd app && npm ci && bash scripts/build-demo.sh
   - Copy everything in app/dist-demo-site/ into demo/hearth/ in the portfolio repo. It's static (about 4 MB), already built for the /demo/hearth/ path, with a copy of index.html in each tab's folder because Pages has no fallback.
   - What it is: a made-up family ("Mia and Leo", parent "Sam", Grandma Jo…) with drawn sample pictures, kept in the visitor's browser only, no backend, no sign-in. A bar on every screen says so and links back to family-photos.html. On a laptop it shows the app at phone width beside a short guide.
   - Hearth checked it on a Pages-like local server (no fallback, 404s): app/e2e-web/site.spec.js. Not checked on the live site; please open chaseholroyd.com/demo/hearth/ and /demo/hearth/photos after publishing.

2. Page fixes on family-photos.html (one story with the Hearth README and case study, Oct 22):
   - Add a primary button "Try the demo" → demo/hearth/ (links=[("Try the demo", "demo/hearth/")]).
   - "Groups and households: share with Everyone, one side of the family, a single house, or an event like a birthday trip." → "Groups you name: share with Everyone, one side of the family, or an event like a birthday trip. One person can be in several groups." (The fixed household tree was dropped for plain named groups.)
   - "600+ backend checks and 340 app tests" → "600+ app tests and 800+ database checks".
   - Agents: eight (staff PM, QA, app engineer, UI/UX for grandparents, UX reviewer for public work, privacy and security, marketing, funding), routed by a chief-of-staff session.
   - Keep: photos encrypted on the phone (AES-256-GCM) before upload; group chat end-to-end encrypted with MLS (RFC 9420); no "Seen by 3 of 8" count, a returned heart shows the photo arrived.

3. Screenshots (sample data only, drawn pictures, no real people), from docs/portfolio/screens/ in the Hearth repo, e.g. into assets/family/:
   - laptop-01-demo.png (alt: "The demo on a laptop: the app beside a short guide")
   - iphone-02-share.png (alt: "Share screen: a picked photo, a caption, and the group that will see it")
   - iphone-03-posted.png (alt: "Photos as the parent: the new post says who it was shared with")
   - iphone-05-grandparent.png (alt: "Photos as a grandparent: bigger text, only what was shared with her")
   The files named in the earlier INTAKE (iphone-03-photos-poster, iphone-08-photos-grandparent) no longer exist.

4. Do not link: thefreighttrains-team-hearth.expo.app (the live app on the family's real backend, sign-in only) or github.com/holroydchase-afk/Hearth (private until the name is final, then AGPL-3.0). Keep "The code is private."

5. Status stays "Private beta soon"; beta target late November, about a dozen family members.

After shipping: log it under "Portfolio / public presence" in Hearth's HANDOFF.md and in STUDIO-STATUS.md.
