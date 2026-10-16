// Core loop on the real app bundle: share as Chase → Grandma Jo sees it → Nana Ruth doesn't →
// heart → comment → Chase deletes it. 360 × 740 (a 4-year-old Galaxy A).
const path = require('path');
const { test, expect } = require('../../e2e/node_modules/@playwright/test');

const FIXTURE = path.join(__dirname, 'fixtures', 'park-gps.jpg');

async function signIn(page, email) {
  await page.goto('/sign-in');
  await page.getByLabel('Your email').fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await page.getByLabel('6-number code').fill('123456');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Photos of Mia and Leo' })).toBeVisible();
}

async function signOut(page, tab) {
  await page.getByRole('tab', { name: tab }).click();
  await page.getByRole('button', { name: 'Sign out of Hearth' }).click();
  await page.getByRole('button', { name: 'Yes, sign out' }).click();
  await expect(page.getByText('Welcome to Hearth')).toBeVisible();
}

/** Decrypt the first chunk of the stored display image with WebCrypto, inside the page. */
async function storedDisplayHeader(page, caption) {
  return page.evaluate(async (cap) => {
    const be = globalThis.__hearthFake;
    const post = Object.values(be.state.posts).find((p) => p.caption === cap);
    const m = Object.values(be.state.media).find((x) => x.post === post.id);
    const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const ct = b64(be.state.objects[m.display_key]);
    const key = await crypto.subtle.importKey('raw', b64(m.dek), 'AES-GCM', false, ['decrypt']);
    const first = ct.subarray(0, Math.min(ct.length, 65536 + 28));
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: first.subarray(0, 12) }, key, first.subarray(12)));
    const text = Array.from(plain.subarray(0, 4096), (c) => String.fromCharCode(c)).join('');
    return { cipherStartsJpeg: ct[0] === 0xff && ct[1] === 0xd8, plainStartsJpeg: plain[0] === 0xff && plain[1] === 0xd8, hasExif: text.includes('Exif'), width: m.width, height: m.height };
  }, caption);
}

test('core loop: share → Jo sees it → Ruth does not → heart → comment → delete', async ({ page }) => {
  // 1. Chase shares a 3000×2000 photo that carries GPS EXIF, to Dad's side only.
  await signIn(page, 'chase@example.com');
  await page.getByRole('tab', { name: 'Share' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Pick photos from your phone' }).click();
  await (await chooser).setFiles(FIXTURE);
  await expect(page.getByText('1 photo picked')).toBeVisible();
  await page.getByLabel("What's happening?").fill('Pumpkin patch');
  await page.getByRole('checkbox', { name: "Grandparents – Dad's side, 2 people" }).click(); // Jo hasn't joined yet
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText('Pumpkin patch', { exact: true })).toBeVisible();
  await expect(page.getByText("Shared with Grandparents – Dad's side · 2 people")).toBeVisible();

  // BETA-SHARE-2/3/5 on the real pipeline: stored bytes are ciphertext; inside, a 2048 px JPEG with no EXIF.
  const stored = await storedDisplayHeader(page, 'Pumpkin patch');
  expect(stored).toEqual({ cipherStartsJpeg: false, plainStartsJpeg: true, hasExif: false, width: 2048, height: 1365 });
  await signOut(page, 'Me');

  // 2. Grandma Jo joins from her invite link and sees it.
  await page.goto('/join/GRANDMAJ23');
  await expect(page.getByText('Chase invited you to see the family photos.')).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.getByRole('button', { name: 'See the photos' }).click();
  await page.getByLabel('Your email').fill('jo@example.com');
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await page.getByLabel('6-number code').fill('123456');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Pumpkin patch', { exact: true })).toBeVisible();
  await expect(page.getByText('Shared with you')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveText([/Photos/, /Help/]); // no Share tab for viewers
  await signOut(page, 'Help');

  // 3. Nana Ruth (Mom's side) does not see it.
  await signIn(page, 'ruth@example.com');
  await expect(page.getByText(/No photos yet/)).toBeVisible();
  await expect(page.getByText('Pumpkin patch', { exact: true })).toHaveCount(0);
  await signOut(page, 'Help');

  // 4. Grandma Jo hearts it and writes back.
  await signIn(page, 'jo@example.com');
  await page.getByRole('button', { name: 'Love it' }).click();
  await expect(page.getByText('♥ You love this')).toBeVisible();
  await page.getByLabel('Write something back to Chase').fill('Look at those cheeks!');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Sent. Chase and the family who got this photo can read it.')).toBeVisible(); // BETA-REPLY-6
  // Full screen and back (BETA-SEE-3).
  await page.getByRole('button', { name: 'Open photo 1 of 1 full screen' }).click();
  await expect(page.getByText(/^From Chase · /)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save to my phone' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await signOut(page, 'Help');

  // 5. Chase sees the heart, the comment and "Seen by 1 of 2", then deletes it.
  await signIn(page, 'chase@example.com');
  await expect(page.getByText('1 person loves this')).toBeVisible();
  await expect(page.getByText(/Look at those cheeks!/)).toBeVisible();
  await expect(page.getByText('Seen by 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Delete this photo' }).click();
  await page.getByRole('button', { name: 'Yes, delete it' }).click();
  await expect(page.getByText('Pumpkin patch', { exact: true })).toHaveCount(0);
  const left = await page.evaluate(() => Object.values(globalThis.__hearthFake.state.posts).filter((p) => !p.deleted && p.status === 'published').length);
  expect(left).toBe(0);
});
