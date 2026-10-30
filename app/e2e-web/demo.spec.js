// DEMO-1..3, DEMO-10, RR-14: the public demo a recruiter opens from chaseholroyd.com.
// No sign-in, a sample family with pictures, a demo bar, Grandma Jo's view, and add / edit / reload / start over.
const path = require('path');
const { test, expect } = require('../../e2e/node_modules/@playwright/test');

const FIXTURE = path.join(__dirname, 'fixtures', 'park-gps.jpg');
const errors = [];

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
});

test('DEMO-1/2/3 opens straight into the sample family: no sign-in, pictures, a demo bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Photos of Mia and Leo' })).toBeVisible();
  await expect(page.getByText(/made-up family/i)).toBeVisible();
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Your email')).toHaveCount(0);
  // The first card's picture really drew (decrypted from the sample bytes).
  await expect.poll(() => page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length)).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: "Back to Chase's portfolio" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("DEMO-10 Grandma Jo's view hides the Mom's-side posts; the parent's view shows them again", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'See the photos as Grandma Jo sees them' }).click();
  await expect(page.getByText(/You're Grandma Jo/)).toBeVisible();
  await expect(page.getByText('Pumpkin patch day', { exact: true })).toBeVisible();
  await expect(page.getByText('Canoe day at the lake', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: "Back to Max's view, the parent" }).click();
  await expect(page.getByText(/You're Max, a parent/)).toBeVisible();
  await page.getByText('Canoe day at the lake', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('Canoe day at the lake', { exact: true })).toBeVisible();
});

test('RR-14 add a photo, reload keeps it, Start over brings back the sample family', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Share' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Pick photos from your phone' }).click();
  await (await chooser).setFiles(FIXTURE);
  await page.getByLabel("What's happening?").fill('Leaf pile');
  await page.getByRole('checkbox', { name: /Grandparents – Dad's side/ }).click();
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText('Leaf pile', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Leaf pile', { exact: true })).toBeVisible();
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start over with the sample family' }).click();
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  await expect(page.getByText('Leaf pile', { exact: true })).toHaveCount(0);
});

test('DEMO-6 / NF-1 laptop shows the story panel beside the app; an unknown link shows plain words', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A private photo app for split families' })).toBeVisible();
  const box = await page.getByTestId('demo-app-column').boundingBox();
  expect(box.width).toBeLessThanOrEqual(432);
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: "We couldn't find that page." })).toBeVisible();
  await expect(page.getByText('Unmatched Route')).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to Photos' }).click();
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
});

test('HARD-7 storage blocked (private window, strict cookie settings): the demo still opens with the sample family', async ({ page }) => {
  await page.addInitScript(() => {
    const deny = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { configurable: true, get: deny });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: deny });
  });
  const mine = [];
  page.on('pageerror', (e) => mine.push(String(e)));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Photos of Mia and Leo' })).toBeVisible();
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  expect(mine).toEqual([]);
});
