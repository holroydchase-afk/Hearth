// PERF-FEED-1 (docs/eng/PERFORMANCE.md): a returning, signed-in person opens the web build and sees the first
// photo. Measured on the real bundle with the fake backend, so it times the app (bundle, start-up, feed,
// decrypt, render), not the network. Budget: 2 s here; a phone over Wi-Fi gets its own check later.
const path = require('path');
const { test, expect } = require('../../e2e/node_modules/@playwright/test');

const FIXTURE = path.join(__dirname, 'fixtures', 'park-gps.jpg');
const BUDGET_MS = 2000;

test('PERF-FEED-1 cold start to the first photo on screen is under 2 s', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Your email').fill('chase@example.com');
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await page.getByLabel('6-number code').fill('123456');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('tab', { name: 'Share' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Pick photos from your phone' }).click();
  await (await chooser).setFiles(FIXTURE);
  await page.getByLabel("What's happening?").fill('Cold start');
  await page.getByRole('checkbox', { name: "Grandparents – Dad's side, 2 people" }).click();
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText('Cold start', { exact: true })).toBeVisible();

  const runs = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    await page.reload();
    await expect(page.locator('img[src^="data:image/jpeg"]').first()).toBeVisible({ timeout: 10_000 });
    runs.push(Date.now() - t0);
  }
  const median = runs.sort((a, b) => a - b)[1];
  console.log(`PERF-FEED-1 cold start to first photo: ${runs.join(', ')} ms (median ${median} ms)`);
  expect(median).toBeLessThan(BUDGET_MS);
});
