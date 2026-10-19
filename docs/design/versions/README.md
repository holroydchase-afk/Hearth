# Hearth design history

Every look Hearth has had, saved so we can compare (Chase, Oct 19: "save a version of the old ui for comparison. it would be nice to have our older versions somehow").

Each version has a folder of screenshots taken with the same demo data and the same steps (`app/e2e-web/snapshot.spec.js`) on two phone sizes, so the same file name in two folders is the same screen. Run the app at the listed commit to try a version for real.

| Version | Commit on `main` | What it looked like |
|---|---|---|
| [v1-original](v1-original/) | `31530f9` (Oct 19, 2026) | Hearth's own look: Young Serif headings, Figtree text, amber buttons, emoji tab icons, custom tab bar |
| [v2-native](v2-native/) | this PR | Native first (`docs/product/DESIGN-SYSTEM.md`): the phone's own font, Apple's look on iPhone and Material 3 on Android, plus Hearth's overrides |

## Adding a version

1. Build the demo web app at that commit: `cd app && npm run export:web:fake`.
2. Take the screenshots:
   ```
   SNAPSHOT_DIR=../docs/design/versions/<name> PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node ../e2e/node_modules/@playwright/test/cli.js test -c e2e-web/playwright.config.js snapshot.spec.js
   ```
3. Add a row above.

The web screenshots use the iPhone look for both sizes (the web build is not Android); the Android look shows only in Expo Go on an Android phone.
