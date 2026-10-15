// Hearth prototype test cases. Each title starts with a case ID that the
// Hearth Test Log tracks. (B#) = bug, (E#) = enhancement, written before the fix.
const { test, expect } = require('@playwright/test');
const path = require('path');

const PAGE = 'file://' + path.resolve(__dirname, '../../prototype/hearth.html');
const FIX = f => path.resolve(__dirname, '../fixtures', f);

async function open(page, opts = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  if (opts.colorScheme) await page.emulateMedia({ colorScheme: opts.colorScheme });
  await page.goto(PAGE);
  return errors;
}
const viewAs = (page, name) => page.selectOption('#viewer', { label: name });
const tab = (page, t) => page.locator(`.tab[data-tab=${t}]`).click();
const captions = page => page.locator('article.post .cap').allInnerTexts();
const post = (page, text) => page.locator('article.post', { hasText: text });

// ---------------- Visibility ----------------
test('VIS-01 Owner sees every post in the family space', async ({ page }) => {
  await open(page);
  expect(await page.locator('article.post').count()).toBe(5);
});

test('VIS-02 Grandma Jo sees only posts shared with her circles', async ({ page }) => {
  await open(page); await viewAs(page, 'Grandma Jo');
  const c = (await captions(page)).join('|');
  expect(c).toContain('first goal'); expect(c).toContain('two wheels'); expect(c).toContain('Birthday dinner');
  expect(c).not.toContain('Pickup swap'); expect(c).not.toContain('ear drops');
});

test('VIS-03 Nana Ruth (other side) does not see "My side" posts', async ({ page }) => {
  await open(page); await viewAs(page, 'Nana Ruth');
  const c = (await captions(page)).join('|');
  expect(c).toContain('first goal'); expect(c).toContain('two wheels');
  expect(c).not.toContain('Birthday dinner'); expect(c).not.toContain('Pickup swap');
});

test('VIS-04 Co-parent sees Everyone + co-parent posts only', async ({ page }) => {
  await open(page); await viewAs(page, 'Alex');
  const c = (await captions(page)).join('|');
  expect(c).toContain('first goal'); expect(c).toContain('Pickup swap'); expect(c).toContain('ear drops');
  expect(c).not.toContain('two wheels'); expect(c).not.toContain('Birthday dinner');
});

test('VIS-05 Changing a post audience revokes access right away', async ({ page }) => {
  await open(page);
  await post(page, 'first goal').getByRole('button', { name: 'Change' }).click();
  await page.locator('.sheet label', { hasText: 'Everyone' }).locator('input').uncheck();
  await page.locator('.sheet label', { hasText: 'My side' }).locator('input').check();
  await page.locator('#saveAud').click();
  await viewAs(page, 'Nana Ruth');
  expect((await captions(page)).join('|')).not.toContain('first goal');
});

test('VIS-06 Removing someone from a circle revokes access and says how many posts (E8)', async ({ page }) => {
  await open(page); await tab(page, 'circles');
  await page.locator('.card', { hasText: 'My side' }).getByRole('button', { name: 'Grandma Jo' }).click();
  await expect(page.locator('.toast')).toContainText('Grandma Jo can no longer see 2 posts');
  await viewAs(page, 'Grandma Jo');
  expect((await captions(page)).join('|')).not.toContain('Birthday dinner');
});

test('VIS-07 Co-parent cannot see the other household\'s relatives in Circles (B2)', async ({ page }) => {
  await open(page); await viewAs(page, 'Alex'); await tab(page, 'circles');
  const t = await page.locator('#view').innerText();
  for (const n of ['Grandma Jo', 'Pop Walt', 'Aunt Kim']) expect(t).not.toContain(n);
  expect(t).toContain('Nana Ruth');
});

test('VIS-08 Co-parent never sees the other parent\'s circle names', async ({ page }) => {
  await open(page); await viewAs(page, 'Alex');
  for (const t of ['feed', 'circles', 'me']) {
    await tab(page, t);
    const txt = await page.locator('#view').innerText();
    expect(txt).not.toContain('My side'); expect(txt).not.toContain("Alex's side");
  }
});

// ---------------- Roles ----------------
test('ROLE-01 Viewers get a clean tab bar with no Share or Circles (B5)', async ({ page }) => {
  await open(page); await viewAs(page, 'Pop Walt');
  await expect(page.locator('.tab[data-tab=post]')).toBeHidden();
  await expect(page.locator('.tab[data-tab=circles]')).toBeHidden();
  const boxes = await page.locator('.tab:visible').evaluateAll(els => els.map(e => e.getBoundingClientRect().width));
  expect(boxes.length).toBe(2);
  for (const w of boxes) expect(w).toBeGreaterThan(150); // tabs fill the bar, no empty slots
});

test('ROLE-02 Viewer can react and comment; the poster sees it', async ({ page }) => {
  await open(page); await viewAs(page, 'Pop Walt');
  const p = post(page, 'Birthday dinner');
  await p.locator('input').fill('Happy birthday kiddo');
  await p.getByRole('button', { name: 'Send' }).click();
  await viewAs(page, 'Chase');
  await expect(post(page, 'Birthday dinner')).toContainText('Happy birthday kiddo');
});

// ---------------- Posting ----------------
test('POST-01 Share a photo to one circle', async ({ page }) => {
  await open(page);
  await tab(page, 'post');
  await page.setInputFiles('#pick', FIX('park.png'));
  await page.fill('#caption', 'Park day test');
  await page.locator('.sheet label', { hasText: 'Everyone' }).locator('input').uncheck();
  await page.locator('.sheet label', { hasText: 'Co-parent' }).locator('input').check();
  await page.locator('#share').click();
  await expect(page.locator('.toast')).toContainText('Shared with 1 person');
  await viewAs(page, 'Alex'); expect((await captions(page)).join('|')).toContain('Park day test');
  await viewAs(page, 'Grandma Jo'); expect((await captions(page)).join('|')).not.toContain('Park day test');
});

test('POST-02 Share stays disabled until a photo or video is picked', async ({ page }) => {
  await open(page); await tab(page, 'post');
  await expect(page.locator('#share')).toBeDisabled();
  await page.setInputFiles('#pick', FIX('park.png'));
  await expect(page.locator('#share')).toBeEnabled();
});

test('POST-03 Picking only an empty circle explains why Share is off (B4)', async ({ page }) => {
  await open(page); await tab(page, 'circles');
  await page.fill('#ncName', 'Soccer parents'); await page.locator('#newCircle button').click();
  await tab(page, 'post');
  await page.setInputFiles('#pick', FIX('park.png'));
  await page.locator('.sheet label', { hasText: 'Everyone' }).locator('input').uncheck();
  await page.locator('.sheet label', { hasText: 'Soccer parents' }).locator('input').check();
  await expect(page.locator('#reachNote')).toContainText('Nobody is in that circle yet');
  await expect(page.locator('#share')).toBeDisabled();
});

test('POST-04 Remove a picked photo before sharing (E6)', async ({ page }) => {
  await open(page); await tab(page, 'post');
  await page.setInputFiles('#pick', [FIX('park.png'), FIX('cake.png')]);
  await expect(page.locator('#thumbs .ph')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove item 1' }).click();
  await expect(page.locator('#thumbs .ph')).toHaveCount(1);
});

test('POST-05 Audience defaults to what that same person used last (B8)', async ({ page }) => {
  await open(page); await tab(page, 'post');
  await page.setInputFiles('#pick', FIX('park.png'));
  await page.locator('.sheet label', { hasText: 'Everyone' }).locator('input').uncheck();
  await page.locator('.sheet label', { hasText: 'My side' }).locator('input').check();
  await page.locator('#share').click();
  await viewAs(page, 'Alex'); await tab(page, 'post');
  await expect(page.locator('.sheet input[type=checkbox]:checked')).toHaveCount(1); // Alex's own default
  await page.locator('[data-close]').first().click();
  await viewAs(page, 'Chase'); await tab(page, 'post');
  await expect(page.locator('.sheet label', { hasText: 'My side' }).locator('input')).toBeChecked();
  await expect(page.locator('.sheet label', { hasText: 'Everyone' }).locator('input')).not.toBeChecked();
});

test('POST-06 Videos upload and show a player', async ({ page }) => {
  await open(page); await tab(page, 'post');
  await page.setInputFiles('#pick', { name: 'goal.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake') });
  await expect(page.locator('#thumbs video')).toHaveCount(1);
});

test('POST-07 Delete your own post, with a confirm step (E1)', async ({ page }) => {
  await open(page);
  await expect(post(page, 'ear drops').getByRole('button', { name: 'Delete post' })).toHaveCount(0);
  await post(page, 'Birthday dinner').getByRole('button', { name: 'Delete post' }).click();
  await page.getByRole('button', { name: 'Keep it' }).click();
  await expect(post(page, 'Birthday dinner')).toHaveCount(1);
  await post(page, 'Birthday dinner').getByRole('button', { name: 'Delete post' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Post deleted');
  await viewAs(page, 'Grandma Jo');
  expect((await captions(page)).join('|')).not.toContain('Birthday dinner');
});

// ---------------- Circles ----------------
test('CIR-01 Create a circle; duplicate names are rejected (B7)', async ({ page }) => {
  await open(page); await tab(page, 'circles');
  await page.fill('#ncName', 'Cousins'); await page.locator('#newCircle button').click();
  await expect(page.locator('.card', { hasText: 'Cousins' })).toHaveCount(1);
  await page.fill('#ncName', 'cousins'); await page.locator('#newCircle button').click();
  await expect(page.locator('.toast')).toContainText('already have a circle called');
  await expect(page.locator('.card b', { hasText: /^Cousins$/i })).toHaveCount(1);
});

test('CIR-02 Rename a circle (E7)', async ({ page }) => {
  await open(page); await tab(page, 'circles');
  await page.locator('.card', { hasText: 'My side' }).getByRole('button', { name: 'Rename' }).click();
  await page.fill('#renameInput', "Chase's family"); await page.locator('#saveRename').click();
  await expect(page.locator('#view')).toContainText("Chase's family");
  await tab(page, 'feed');
  await expect(post(page, 'Birthday dinner')).toContainText("Chase's family");
});

test('CIR-03 Deleting a circle is blocked when a post would lose its only audience (E7)', async ({ page }) => {
  await open(page); await tab(page, 'circles');
  await page.locator('.card', { hasText: 'Co-parent' }).getByRole('button', { name: 'Delete circle' }).click();
  await expect(page.locator('.toast')).toContainText('only audience for 1 post');
  await page.fill('#ncName', 'Temp'); await page.locator('#newCircle button').click();
  await page.locator('.card', { hasText: 'Temp' }).getByRole('button', { name: 'Delete circle' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.card', { hasText: 'Temp' })).toHaveCount(0);
});

// ---------------- Invites ----------------
test('INV-01 Copy invite link never crashes, even without clipboard access (B1)', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await tab(page, 'circles');
  await page.getByRole('button', { name: 'Invite someone' }).click();
  await page.fill('#invName', 'Uncle Ray');
  await page.locator('#makeInvite').click();
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('.toast')).toBeVisible();
  expect(errors).toEqual([]);
});

test('INV-02 Invite lands the new person in the chosen circles (E3)', async ({ page }) => {
  await open(page); await tab(page, 'circles');
  await page.getByRole('button', { name: 'Invite someone' }).click();
  await page.fill('#invName', 'Uncle Ray');
  await page.selectOption('#invRole', 'viewer');
  await page.locator('.sheet label', { hasText: 'My side' }).locator('input').check();
  await page.locator('#makeInvite').click();
  await expect(page.locator('.sheet .code')).toContainText('hearth.family/join/');
  await page.locator('[data-close]').first().click();
  await expect(page.locator('.card', { hasText: 'My side' })).toContainText('Uncle Ray (invited)');
});

// ---------------- Notifications ----------------
test('NOTE-01 Text-message preview names the real poster (B3)', async ({ page }) => {
  await open(page); await tab(page, 'me');
  await page.locator('#n-text').check();
  await expect(page.locator('.sms')).toContainText('Alex shared');   // newest post Chase didn't write
  await viewAs(page, 'Alex'); await page.locator('#n-text').check();
  await expect(page.locator('.sms')).toContainText('Chase shared');
});

test('NOTE-02 Notification choice is kept per person', async ({ page }) => {
  await open(page); await viewAs(page, 'Grandma Jo'); await tab(page, 'me');
  await page.locator('#n-weekly').check();
  await viewAs(page, 'Pop Walt'); await tab(page, 'me');
  await expect(page.locator('#n-daily')).toBeChecked();
  await viewAs(page, 'Grandma Jo'); await tab(page, 'me');
  await expect(page.locator('#n-weekly')).toBeChecked();
});

// ---------------- Comments & viewing ----------------
test('COM-01 A half-typed comment survives reacting to another post (B6)', async ({ page }) => {
  await open(page);
  await post(page, 'two wheels').locator('input').fill('So proud');
  await post(page, 'first goal').getByRole('button', { name: /React ❤️/ }).click();
  await expect(post(page, 'two wheels').locator('input')).toHaveValue('So proud');
});

test('VIEW-01 Tap a photo to open it full screen; swipe through; Escape closes (E2)', async ({ page }) => {
  await open(page);
  await post(page, 'first goal').locator('.ph').first().click();
  const v = page.getByRole('dialog', { name: 'Photo viewer' });
  await expect(v).toBeVisible();
  await expect(v).toContainText('1 of 2');
  await v.getByRole('button', { name: 'Next' }).click();
  await expect(v).toContainText('2 of 2');
  await page.keyboard.press('Escape');
  await expect(v).toHaveCount(0);
});

test('VIEW-02 Poster sees "Seen by" on their posts (E4)', async ({ page }) => {
  await open(page);
  await expect(post(page, 'first goal')).toContainText('Seen by 3 of 5');
  await viewAs(page, 'Grandma Jo');
  await expect(post(page, 'first goal')).not.toContainText('Seen by');
});

// ---------------- Accessibility & quality ----------------
test('A11Y-01 Sheets take focus and close with Escape (B9)', async ({ page }) => {
  await open(page); await tab(page, 'post');
  const inSheet = await page.evaluate(() => !!document.activeElement.closest('.sheet'));
  expect(inSheet).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet')).toHaveCount(0);
});

test('A11Y-02 Larger text option for grandparents (E5)', async ({ page }) => {
  await open(page); await viewAs(page, 'Grandma Jo'); await tab(page, 'me');
  const before = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  await page.locator('#bigText').check();
  const after = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  expect(after).toBeGreaterThanOrEqual(before + 3);
});

for (const scheme of ['light', 'dark']) {
  test(`A11Y-03 No sideways scrolling on a small phone (${scheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page, { colorScheme: scheme });
    for (const t of ['feed', 'circles', 'me']) {
      await tab(page, t);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `tab ${t}`).toBeLessThanOrEqual(0);
    }
  });
}

test('A11Y-04 No script errors through a full walkthrough', async ({ page }) => {
  const errors = await open(page);
  for (const who of ['Chase', 'Alex', 'Grandma Jo', 'Nana Ruth'])
    for (const t of ['feed', 'circles', 'me']) {
      await viewAs(page, who);
      const b = page.locator(`.tab[data-tab=${t}]`);
      if (await b.isVisible()) await b.click();
    }
  expect(errors).toEqual([]);
});

test('SEC-01 Captions and comments can\'t inject code', async ({ page }) => {
  await open(page);
  await post(page, 'first goal').locator('input').fill('<img src=x onerror="window.pwned=1">');
  await post(page, 'first goal').getByRole('button', { name: 'Send' }).click();
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await expect(post(page, 'first goal')).toContainText('<img src=x');
});
