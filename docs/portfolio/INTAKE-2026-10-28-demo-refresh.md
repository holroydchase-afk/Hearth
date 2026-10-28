INTAKE for Product Studio (from Hearth, Oct 28, 2026): refresh the hosted demo

Repo: holroydchase-afk.github.io (portfolio). Folder: demo/hearth/ (hosted since portfolio PR #15). Page: family-photos.html. Owner: Product Studio.

When: after Chase merges Hearth PRs #63-#66 (release M1.1). Before then the build below is from the unmerged branch head (919fb88), so wait for his "merge" unless he says otherwise.

Ask:

1. Replace the contents of demo/hearth/ with the new build.
   - Ready-made: the project files folder holds portfolio/hearth-demo-site-2026-10-28.tgz (1.3 MB, unpack into demo/hearth/).
   - Or rebuild from Hearth main after the merge: `cd app && bash scripts/build-demo.sh`, then copy `app/dist-demo-site/`.
   - Checked locally on a Pages-like static host: `npm run e2e:site` 8/8 green (cold load, every tab, pictures, full-screen reload, links stay inside /demo/hearth/). First card shows in about 1.2 s.

2. What visitors will see that's new:
   - A one-line demo bar with three matching chips (As Grandma, Start over, Portfolio).
   - On a laptop: the phone centred with a shadow, three proof points (Private by name, Data stays in the US, No ads, no AI training) and a "Read the case study" link to family-photos.html.
   - Post titles on cards ("Mia's 5th birthday", "Beach weekend"), and long captions fold behind Read more.

3. Facts on family-photos.html, if you touch it (checkable in the Hearth repo once merged):
   - Tests: 660+ app tests and 960+ database checks (the page says 600+ and 800+).
   - The app's contract also runs against a real Postgres + PostgREST API in CI on every PR.

4. Unchanged rules: keep the placeholder name and the "name coming" note. Don't link the expo.app build or the Hearth repo. Status tag stays "Private beta soon".

5. After shipping: re-run the sweep against the live URL (`SHOWCASE_BASE=https://chaseholroyd.com/demo/hearth/ SHOWCASE_DIR=<dir> npm run e2e:demo -- demo-showcase.spec.js` in Hearth/app). Then log it under "Portfolio / public presence" in Hearth's HANDOFF.md and in STUDIO-STATUS.md.

Live check before this refresh (Oct 28, 08:00 UTC): chaseholroyd.com/demo/hearth/ answers 200. The showcase sweep passed at phone and laptop width (light), with no console errors except the expected 404 on the not-found page. First card in about 2.1 s. It still shows the old two-line demo bar and no titles.
