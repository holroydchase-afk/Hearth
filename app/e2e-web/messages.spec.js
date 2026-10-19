// MSG-4 on the real web bundle: ts-mls + Hearth's noble ciphersuite as Metro bundles them. Chase starts the chat
// for Dad's side, sends a message, and the relay holds only sealed bytes. 360 × 740 (a 4-year-old Galaxy A).
const { test, expect } = require('../../e2e/node_modules/@playwright/test');

test('MSG-4 the bundled app makes an MLS group and sends a sealed message', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Your email').fill('chase@example.com');
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await page.getByLabel('6-number code').fill('123456');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Photos of Mia and Leo' })).toBeVisible();

  await page.getByRole('button', { name: 'Messages' }).click();
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
  await page.getByRole('button', { name: "Open the chat Grandparents – Dad's side" }).click();
  await expect(page.getByText('No messages yet. Say hello!')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Your message').fill('Hello from the web');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Hello from the web')).toBeVisible({ timeout: 15000 });

  const relayed = await page.evaluate(() => {
    const rows = globalThis.__hearthFake.state.chat.rows;
    return { kinds: rows.map((r) => r.kind), plain: rows.some((r) => atob(r.body).includes('Hello from the web')) };
  });
  expect(relayed).toEqual({ kinds: ['message'], plain: false });
});
