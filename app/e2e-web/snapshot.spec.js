// UI snapshots for the design history (docs/design/versions/). Skipped unless SNAPSHOT_DIR is set:
//   SNAPSHOT_DIR=../docs/design/versions/v2-native npm run e2e:web -- snapshot.spec.js
// Same demo data and the same steps for every version, so screens line up side by side.
// 390 × 844 is an iPhone 14/15 in points; 360 × 740 is a 4-year-old Galaxy A.
const path = require('path');
const { test, expect } = require('../../e2e/node_modules/@playwright/test');

const DIR = process.env.SNAPSHOT_DIR;
const FIXTURE = path.join(__dirname, 'fixtures', 'park-gps.jpg');
const PHONES = [
  { name: 'iphone', width: 390, height: 844 },
  { name: 'android', width: 360, height: 740 },
];

for (const phone of PHONES) {
  test(`snapshot (${phone.name})`, async ({ page }) => {
    test.skip(!DIR, 'set SNAPSHOT_DIR to take snapshots');
    await page.setViewportSize({ width: phone.width, height: phone.height });
    const shot = (name) => page.screenshot({ path: path.join(DIR, `${phone.name}-${name}.png`) });
    const signIn = async (email) => {
      await page.goto('/sign-in');
      await page.getByLabel('Your email').fill(email);
      await page.getByRole('button', { name: 'Send me a code' }).click();
      await page.getByLabel('6-number code').fill('123456');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Photos of Mia and Leo' })).toBeVisible();
    };

    await page.goto('/sign-in');
    await expect(page.getByLabel('Your email')).toBeVisible();
    await shot('01-sign-in');

    await signIn('chase@example.com');
    await page.getByRole('tab', { name: 'Share' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Pick photos from your phone' }).click();
    await (await chooser).setFiles(FIXTURE);
    await expect(page.getByText('1 photo picked')).toBeVisible();
    await page.getByLabel("What's happening?").fill('Pumpkin patch');
    await page.getByRole('checkbox', { name: "Grandparents – Dad's side, 2 people" }).click();
    await shot('02-share');
    await page.getByRole('button', { name: 'Post' }).click();
    await expect(page.getByText('Pumpkin patch', { exact: true })).toBeVisible();
    await shot('03-photos-poster');
    await page.getByRole('tab', { name: 'Groups' }).click();
    await page.waitForTimeout(500);
    await shot('04-groups');
    await page.getByRole('tab', { name: 'Me' }).click();
    await page.waitForTimeout(500);
    await shot('05-me');
    await page.getByRole('button', { name: 'Sign out of Hearth' }).click();
    await page.waitForTimeout(300);
    await shot('06-confirm');
    await page.getByRole('button', { name: 'Yes, sign out' }).click();

    await page.goto('/join/GRANDMAJ23');
    await expect(page.getByText('Chase invited you to see the family photos.')).toBeVisible();
    await shot('07-invite');
    await page.getByRole('button', { name: 'See the photos' }).click();
    await page.getByLabel('Your email').fill('jo@example.com');
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await page.getByLabel('6-number code').fill('123456');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Pumpkin patch', { exact: true })).toBeVisible();
    await shot('08-photos-grandparent');
    await page.getByRole('button', { name: 'Open photo 1 of 1 full screen' }).click();
    await expect(page.getByRole('button', { name: 'Save to my phone' })).toBeVisible();
    await shot('09-full-screen');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('tab', { name: 'Help' }).click();
    await page.waitForTimeout(500);
    await shot('10-help');
  });
}
