// BETA-BULK-3/4/5: the one review screen before a bulk pick sends, and its progress.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { memoryKV } from '../../platform/kv';
import { saveLastAudience } from '../../share/audienceMemory';
import type { PickedAsset } from '../../share/bulk';
import { expectGrandparentSafe, renderApp, screenWords } from '../../test/renderApp';
import { planBatch } from '../../share/bulk';
import { BatchReview } from '../BatchReview';
import { ShareScreen } from '../ShareScreen';

const DAD = "Grandparents – Dad's side";
const EVERYONE = FIXTURE.circles.everyone;

let n = 0;
const photo = (date: string): PickedAsset => ({
  uri: `file:///picked/IMG_${++n}.jpg`, type: 'image', mimeType: 'image/jpeg', width: 4032, height: 3024,
  exif: { DateTimeOriginal: date, OffsetTimeOriginal: '-04:00', GPSLatitude: 35.2271, GPSLongitude: -80.8431, Make: 'Apple' },
});
const day = (d: string, count: number) => Array.from({ length: count }, (_, i) => photo(`${d} ${String(8 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}:00`));
const video = (): PickedAsset => ({ uri: `file:///picked/MOV_${++n}.mov`, type: 'video', mimeType: 'video/quicktime', duration: 12_000 });
/** 48 photos from 3 days (20, 18, 10) and 3 videos. */
const pick48 = () => [...day('2024:07:04', 20), video(), ...day('2024:07:05', 18), video(), video(), ...day('2024:07:06', 10)];

async function openReview(opts: { last?: string[]; assets?: PickedAsset[]; be?: FakeBackend } = {}) {
  const kv = memoryKV();
  if (opts.last) await saveLastAudience(kv, FIXTURE.users.chase.id, opts.last);
  const pickBulk = jest.fn(async () => ({ assets: opts.assets ?? pick48() }));
  const r = await renderApp(<ShareScreen />, { user: 'chase', kv, be: opts.be, deps: { pickBulk } });
  fireEvent.press(await screen.findByRole('button', { name: 'Pick up to 100 photos at once' }));
  await screen.findByText('48 photos from 3 days');
  return { ...r, pickBulk, kv };
}

describe('BETA-BULK-3 batch review screen', () => {
  it('BETA-BULK-3 "48 photos from 3 days. Send to: <last group>"; one Send for the whole batch', async () => {
    await openReview({ last: [FIXTURE.circles.dadSide.id] });
    expect(screen.getByRole('header', { name: '48 photos from 3 days' })).toBeTruthy();
    expect(screen.getByText(`Send to: ${DAD}`)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change who these go to' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send 48 photos' })).toBeTruthy();
    // no per-photo steps
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^Remove/ })).toHaveLength(0);
  });

  it('BETA-BULK-5 says plainly that videos were skipped', async () => {
    await openReview({ last: [FIXTURE.circles.dadSide.id] });
    expect(screen.getByText("Hearth can't send videos yet, so 3 videos were left out.")).toBeTruthy();
  });

  it('BETA-BULK-3 never a silent Everyone: with no last group, Send waits and the group list is already open', async () => {
    await openReview();
    expect(screen.getByText('Send to: nobody yet. Pick who should see these.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send 48 photos' }).props.accessibilityState).toMatchObject({ disabled: true });
    // grandparent-ux: no hidden step; the choices show without tapping Change first
    fireEvent.press(await screen.findByRole('checkbox', { name: new RegExp(`^${EVERYONE.name},`) }));
    expect(screen.getByText(`Send to: ${EVERYONE.name}`)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send 48 photos' }).props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('BETA-BULK-3 Change lists Everyone first, then the groups', async () => {
    await openReview({ last: [FIXTURE.circles.dadSide.id] });
    fireEvent.press(screen.getByRole('button', { name: 'Change who these go to' }));
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes[0]!.props.accessibilityLabel).toMatch(new RegExp(`^${EVERYONE.name},`));
  });

  it('BETA-BULK-3/4/6 Send makes 5 posts with their dates and one batch, to the chosen group only', async () => {
    const be = FakeBackend.withFixture();
    const { nav } = await openReview({ last: [FIXTURE.circles.dadSide.id], be });
    fireEvent.press(screen.getByRole('button', { name: 'Send 48 photos' }));
    await waitFor(() => expect(nav.goPhotos).toHaveBeenCalled());
    await waitFor(() => expect(Object.values(be.state.posts).filter((p) => p.status === 'published')).toHaveLength(5), { timeout: 5000 });
    const posts = Object.values(be.state.posts);
    expect(new Set(posts.map((p) => p.batch_id)).size).toBe(1);
    expect(posts.every((p) => p.batch_size === 5 && p.circles.join() === FIXTURE.circles.dadSide.id)).toBe(true);
    expect(posts.map((p) => p.taken_at).sort()[0]).toBe('2024-07-04T12:00:00.000Z');
    // only the date left the phone: nothing in the backend state carries EXIF or GPS.
    // T5: leave out `objects` (random base64 ciphertext) and every `dek` (a random base64 key);
    // either can spell "GPS" by chance. The bytes themselves are checked for EXIF by the
    // pipeline tests before encryption.
    const { objects: _ciphertext, ...meta } = be.state;
    const noKeys = JSON.stringify(meta, (k, v) => (k === 'dek' ? undefined : v));
    expect(noKeys).not.toMatch(/GPS|35\.22|Apple|DateTimeOriginal/);
  });

  it('BETA-BULK-3 "Don\'t send" goes back without sending anything', async () => {
    const be = FakeBackend.withFixture();
    await openReview({ last: [FIXTURE.circles.dadSide.id], be });
    fireEvent.press(screen.getByRole('button', { name: "Don't send these photos" }));
    expect(await screen.findByRole('button', { name: 'Pick up to 100 photos at once' })).toBeTruthy();
    expect(Object.keys(be.state.posts)).toHaveLength(0);
  });

  it('BETA-BULK-2 says when a pick went over 100', async () => {
    const kv = memoryKV();
    await saveLastAudience(kv, FIXTURE.users.chase.id, [FIXTURE.circles.dadSide.id]);
    const pickBulk = jest.fn(async () => ({ assets: [...day('2024:03:01', 60), ...day('2024:03:02', 60)] }));
    await renderApp(<ShareScreen />, { user: 'chase', kv, deps: { pickBulk } });
    fireEvent.press(await screen.findByRole('button', { name: 'Pick up to 100 photos at once' }));
    expect(await screen.findByText('100 photos from 2 days')).toBeTruthy();
    expect(screen.getByText('Hearth sends up to 100 photos at a time, so 20 were left out. Pick them next time.')).toBeTruthy();
  });

  it('BETA-BULK-3 is grandparent-safe, in plain words', async () => {
    await openReview({ last: [FIXTURE.circles.dadSide.id] });
    fireEvent.press(screen.getByRole('button', { name: 'Change who these go to' }));
    await screen.findAllByRole('checkbox');
    expectGrandparentSafe();
    expect(screenWords()).not.toMatch(/circle|batch|upload|EXIF|metadata/i);
  });
});

describe('BETA-BULK-3 privacy-security review: Send never goes to a group it has not named', () => {
  const plan = () => planBatch(pick48());
  const noop = () => {};
  it('BETA-BULK-3 while the groups are still loading, a remembered choice cannot be sent unnamed', () => {
    render(<BatchReview plan={plan()} circles={null} chosen={[EVERYONE.id]} onToggle={noop} onSend={noop} onCancel={noop} busy={false} />);
    expect(screen.queryByText(`Send to: ${EVERYONE.name}`)).toBeNull();
    expect(screen.getByRole('button', { name: 'Send 48 photos' }).props.accessibilityState).toMatchObject({ disabled: true });
  });
  it('BETA-BULK-3 a chosen id that is not one of the loaded groups blocks Send', () => {
    const circles = [{ circle_id: FIXTURE.circles.dadSide.id, name: DAD, member_count: 2, member_names: ['Gma', 'Gpa'] }];
    render(<BatchReview plan={plan()} circles={circles as never} chosen={[FIXTURE.circles.dadSide.id, EVERYONE.id]}
      onToggle={noop} onSend={noop} onCancel={noop} busy={false} />);
    expect(screen.getByRole('button', { name: 'Send 48 photos' }).props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('BETA-BULK-4 batch progress', () => {
  it('BETA-BULK-4 one line for the whole batch: "Sending N of 48 photos…", not 5 cards', async () => {
    const be = FakeBackend.withFixture();
    const api = be.clientFor(null, { trackAppSession: true });
    jest.spyOn(api, 'createPost').mockImplementation(() => new Promise(() => {})); // stays on the first post
    const kv = memoryKV();
    await saveLastAudience(kv, FIXTURE.users.chase.id, [FIXTURE.circles.dadSide.id]);
    const pickBulk = jest.fn(async () => ({ assets: pick48() }));
    await renderApp(<ShareScreen />, { user: 'chase', kv, be, deps: { pickBulk, api } });
    fireEvent.press(await screen.findByRole('button', { name: 'Pick up to 100 photos at once' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Send 48 photos' }));
    expect(await screen.findByText('Sending 1 of 48 photos…')).toBeTruthy();
    expect(screen.queryAllByText(/Getting ready/)).toHaveLength(0);
  });
});
