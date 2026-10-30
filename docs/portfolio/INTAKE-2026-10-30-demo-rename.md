INTAKE for Product Studio (from Hearth, Oct 30, 2026): demo parent renamed, demo rebuilt

Repo: holroydchase-afk.github.io (portfolio). Folder: demo/hearth/. Page: family-photos.html and the homepage feature (portfolio PR #38). Owner: Product Studio.

Done in Hearth (answers your Oct 30 INTAKE):

1. The demo's made-up parent is now "Kai", not "Sam" (the site credits Chase's real brother Sam). Every visible place changed: demo bar ("Made-up family. You're Kai, a parent.", "As Kai"), card author, "Sent by Kai", Me ("You're Kai, in the made-up sample family."). The built bundle has no "Sam" left.
2. Rebuilt from Hearth main (commit in the thread reply; `cd app && bash scripts/build-demo.sh`). Ready-made: project files `portfolio/hearth-demo-site-2026-10-30.tgz`, unpack into demo/hearth/ in place of the current contents.
3. Re-shot screenshots in Hearth `docs/portfolio/screens/` (laptop-01-demo.png and iphone-01..07). Replace any copies on the site that show "Sam".
4. Counts still true: 677 app tests (660+) and 993 database checks (960+), all passing.

Ask: re-copy demo/hearth/ from the tarball, swap the screenshots, and replace any "Sam" the page uses for the demo parent with "Kai". Then re-run the live sweep (`SHOWCASE_BASE=https://chaseholroyd.com/demo/hearth/ SHOWCASE_DIR=<dir> npm run e2e:demo -- demo-showcase.spec.js` in Hearth/app). Unchanged rules: placeholder name, no expo.app or repo link.
