// DEMO-5 (RR-5): the hosted demo works under /demo/hearth/ on a static host (GitHub Pages rules):
// the first page, a cold load of each tab's address, the pictures, and no failed requests.
const { test, expect } = require('../../e2e/node_modules/@playwright/test');

for (const tab of ['', 'photos', 'share', 'groups', 'me']) {
  test(`DEMO-5 a cold load of /demo/hearth/${tab} works with no server fallback`, async ({ page }) => {
    const failed = [];
    page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    page.on('pageerror', (e) => failed.push(String(e)));
    await page.goto(`/demo/hearth/${tab}`);
    await expect(page.getByText(/made-up family/i)).toBeVisible();
    if (tab === '' || tab === 'photos') {
      await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length)).toBeGreaterThan(0);
    }
    expect(failed).toEqual([]);
  });
}

test('DEMO-5 every link inside the demo stays under /demo/hearth/ or goes to chaseholroyd.com', async ({ page }) => {
  await page.goto('/demo/hearth/');
  await expect(page.getByText('Mia turned 5!', { exact: true })).toBeVisible();
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
  for (const h of hrefs) expect(h.startsWith('/demo/hearth') || h.startsWith('https://chaseholroyd.com')).toBe(true);
});

test("DEMO-5 Grandma's view and Start over stay inside /demo/hearth/", async ({ page }) => {
  await page.goto('/demo/hearth/');
  await page.getByRole('button', { name: 'See the photos as Grandma Jo sees them' }).click();
  await expect(page.getByText(/You're Grandma Jo/)).toBeVisible();
  expect(new URL(page.url()).pathname).toMatch(/^\/demo\/hearth\/photos\/?$/);
  await page.getByRole('button', { name: 'Start over with the sample family' }).click();
  await expect(page.getByText(/You're Kai, a parent/)).toBeVisible();
  expect(new URL(page.url()).pathname).toMatch(/^\/demo\/hearth\//);
});

test('RR-15 reloading an open full-screen photo on the static host keeps the photo open', async ({ page }) => {
  await page.goto('/demo/hearth/');
  await page.getByRole('button', { name: /Open photo 1 of/ }).first().click();
  await expect(page.getByRole('button', { name: 'Save to my phone' })).toBeVisible();
  const status = (await page.reload()).status();
  expect(status).toBe(200);
  await expect(page.getByRole('button', { name: 'Save to my phone' })).toBeVisible();
});
