// DEMO-1..3, DEMO-10, RR-14: the public demo a recruiter opens from chaseholroyd.com.
// No sign-in, a sample family with pictures, a demo bar, Grandma Jo's view, and add / edit / reload / start over.
const path = require('path');
const { test, expect } = require('../../e2e/node_modules/@playwright/test');

// DEMO-BAR: Grandma's view and Reset live in the Details drawer.
const details = async (page) => {
  const t = page.getByRole('button', { name: 'Demo details' });
  if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
};
const resetDemo = async (page) => {
  await details(page);
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
};

const FIXTURE = path.join(__dirname, 'fixtures', 'park-gps.jpg');
const errors = [];

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
});

test('DEMO-1/2/3 opens straight into the sample family: no sign-in, pictures, a demo bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Photos of Mia and Leo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Demo details' })).toBeVisible();
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Your email')).toHaveCount(0);
  // The first card's picture really drew (decrypted from the sample bytes).
  await expect.poll(() => page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length)).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: 'Back to the portfolio' })).toBeVisible();
  expect(errors).toEqual([]);
});

test("DEMO-10 Grandma Jo's view hides the Mom's-side posts; the parent's view shows them again", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  await details(page);
  await page.getByRole('button', { name: 'See the photos as Grandma Jo sees them' }).click();
  await details(page);
  await expect(page.getByText(/You're Grandma Jo/)).toBeVisible();
  await expect(page.getByText('Pumpkin patch day', { exact: true })).toBeVisible();
  await expect(page.getByText('Canoe day at the lake', { exact: true })).toHaveCount(0);
  await details(page);
  await page.getByRole('button', { name: "Back to Kai's view, the parent" }).click();
  await details(page);
  await expect(page.getByText(/You're Kai, a parent/)).toBeVisible();
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
  await resetDemo(page);
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

// DEMO-BAR (intake #82, pm-tools docs/DEMO-BANNER.md "Done when").
for (const width of [390, 1280]) {
  test(`DEMO-BAR at ${width} px: collapsed and slim, pushes the app down, Esc closes, Hearth's font and no accent badge`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
    const bar = page.getByRole('region', { name: 'Demo' });
    const toggle = page.getByRole('button', { name: 'Demo details' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('link', { name: 'Back to the portfolio' })).toBeVisible();
    expect((await bar.boundingBox()).height).toBeLessThanOrEqual(48);
    // The middle note only where it fits whole at 17 pt (DS-2).
    await expect(page.getByText(/^Sample data/)).toHaveCount(0); // 390 px phone and the 430 px laptop column: no room at 17 pt
    await expect(page.getByText('Tip: tap Details, then See it as Grandma Jo.')).toHaveCount(width < 900 ? 1 : 0);
    const heading = page.getByRole('heading', { name: 'Photos of Mia and Leo' });
    const before = (await heading.boundingBox()).y;
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/^This is the real Hearth, running on made-up sample data\./)).toBeVisible();
    expect((await heading.boundingBox()).y).toBeGreaterThan(before + 40); // pushed down, not covered
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    const look = await page.evaluate(() => {
      const badge = document.querySelector('[data-testid="demo-badge"]');
      return {
        barFont: getComputedStyle(badge.firstElementChild ?? badge).fontFamily,
        bodyFont: getComputedStyle(document.querySelector('[role="heading"]')).fontFamily,
        badgeBorder: getComputedStyle(badge).borderTopColor, badgeBg: getComputedStyle(badge).backgroundColor,
      };
    });
    expect(look.barFont).toBe(look.bodyFont);
    expect(['rgb(0, 64, 221)', 'rgb(64, 156, 255)']).not.toContain(look.badgeBorder); // Hearth's accent, light and dark
    expect(look.badgeBg).toBe('rgba(0, 0, 0, 0)');
  });
}

test('DEMO-BAR no sideways scroll down to 320 px, back link still there', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the portfolio' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('DEMO-BAR Reset asks first: Keep changes nothing; Reset restores and says so once', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  await details(page);
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByText('Put the sample data back? Your changes will be lost.')).toBeVisible();
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByText(/Put the sample data back/)).toHaveCount(0);
  await expect(page.getByText('Sample data restored.')).toHaveCount(0);
  await resetDemo(page);
  await expect(page.getByText('Sample data restored.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Demo details' })).toHaveAttribute('aria-expanded', 'false');
});
