// Showcase screenshots for the recruiter-ready review (docs/reviews/2026-10-22-recruiter-ready.md).
// Skipped unless SHOWCASE_DIR is set:
//   SHOWCASE_DIR=/tmp/shots npm run e2e:web -- showcase.spec.js
// Every screen at a phone (390 × 844) and a laptop (1280 × 800), light and dark, viewport and full page.
// Console errors and failed requests are written to SHOWCASE_DIR/console.json.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('../../e2e/node_modules/@playwright/test');

const DIR = process.env.SHOWCASE_DIR;
const FIXTURE = path.join(__dirname, 'fixtures', 'park-gps.jpg');
const SIZES = [
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'laptop', width: 1280, height: 800, touch: false },
];
const SCHEMES = ['light', 'dark'];
const problems = [];

for (const size of SIZES) {
  for (const scheme of SCHEMES) {
    test(`showcase ${size.name} ${scheme}`, async ({ browser }) => {
      test.skip(!DIR, 'set SHOWCASE_DIR to take showcase screenshots');
      const ctx = await browser.newContext({
        viewport: { width: size.width, height: size.height }, hasTouch: size.touch, colorScheme: scheme,
      });
      const page = await ctx.newPage();
      const tag = `${size.name}-${scheme}`;
      page.on('console', (m) => { if (m.type() === 'error') problems.push({ tag, url: page.url(), text: m.text() }); });
      page.on('pageerror', (e) => problems.push({ tag, url: page.url(), text: String(e) }));
      page.on('requestfailed', (r) => problems.push({ tag, url: r.url(), text: `request failed: ${r.failure()?.errorText}` }));
      let n = 0;
      const shot = async (name) => {
        await page.waitForTimeout(400);
        n += 1;
        const base = path.join(DIR, `${tag}-${String(n).padStart(2, '0')}-${name}`);
        await page.screenshot({ path: `${base}.png` });
        await page.screenshot({ path: `${base}-full.png`, fullPage: true });
      };

      await page.goto('/');
      await shot('first-screen');
      await page.goto('/sign-in');
      await expect(page.getByLabel('Your email')).toBeVisible();
      await shot('sign-in');
      await page.getByLabel('Your email').fill('chase@example.com');
      await page.getByRole('button', { name: 'Send me a code' }).click();
      await page.getByLabel('6-number code').fill('123456');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Photos of Mia and Leo' })).toBeVisible();
      await shot('photos-start');
      await page.getByRole('tab', { name: 'Share' }).click();
      await shot('share-empty');
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Pick photos from your phone' }).click();
      await (await chooser).setFiles(FIXTURE);
      await expect(page.getByText('1 photo picked')).toBeVisible();
      await page.getByLabel("What's happening?").fill('Pumpkin patch');
      await page.getByRole('checkbox', { name: "Grandparents – Dad's side, 2 people" }).click();
      await shot('share-filled');
      await page.getByRole('button', { name: 'Post' }).click();
      await expect(page.getByText('Pumpkin patch', { exact: true })).toBeVisible();
      await shot('photos-poster');
      await page.getByRole('tab', { name: 'Groups' }).click();
      await shot('groups');
      await page.getByRole('tab', { name: 'Me' }).click();
      await shot('me');
      await page.getByRole('button', { name: 'Sign out of Hearth' }).click();
      await shot('sign-out-confirm');
      await page.getByRole('button', { name: 'Yes, sign out' }).click();
      await page.goto('/join/GRANDMAJ23');
      await expect(page.getByText('Chase invited you to see the family photos.')).toBeVisible();
      await shot('invite');
      await page.getByRole('button', { name: 'See the photos' }).click();
      await page.getByLabel('Your email').fill('jo@example.com');
      await page.getByRole('button', { name: 'Send me a code' }).click();
      await page.getByLabel('6-number code').fill('123456');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Pumpkin patch', { exact: true })).toBeVisible();
      await shot('photos-grandparent');
      await page.getByRole('button', { name: 'Open photo 1 of 1 full screen' }).click();
      await expect(page.getByRole('button', { name: 'Save to my phone' })).toBeVisible();
      await shot('full-screen');
      await page.getByRole('button', { name: 'Close' }).click();
      await page.getByRole('tab', { name: 'Help' }).click();
      await shot('help');
      await page.goto('/join/EXPRDEXPRD');
      await shot('invite-expired');
      await page.goto('/no-such-page');
      await shot('not-found');
      await ctx.close();
    });
  }
}

test.afterAll(() => {
  if (DIR) fs.writeFileSync(path.join(DIR, 'console.json'), JSON.stringify(problems, null, 2));
});
