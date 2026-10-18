// SPEC-GROUPS first build on screen (BETA-AUD-19, BETA-REPLY-11, BETA-REPLY-12) plus the Oct 17
// decisions for bulk + timeline: only parents get "Pick lots of photos", and a timeline card opens
// the full post (hearts and replies). Written first (qa-tdd, Oct 17): red until the app catches up.
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import type { HearthApi } from '../../api/HearthApi';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { GroupsScreen } from '../GroupsScreen';
import { PhotosScreen } from '../PhotosScreen';
import { ShareScreen } from '../ShareScreen';

const DAD = "Grandparents – Dad's side";

/** The app's API with a spy for createInvite (so we can see the share-history choice it sends). */
function spiedApi(be: FakeBackend) {
  const api = be.clientFor(null, { trackAppSession: true });
  const createInvite = jest.spyOn(api, 'createInvite');
  return { api, createInvite };
}

describe('BETA-AUD-19 invite form: share history, no default', () => {
  async function openForm() {
    const be = FakeBackend.withFixture();
    const { api, createInvite } = spiedApi(be);
    await renderApp(<GroupsScreen />, { be, user: 'chase', deps: { api } });
    fireEvent.press(await screen.findByRole('button', { name: `Invite someone to ${DAD}` }));
    return { be, createInvite };
  }

  it('BETA-AUD-19 asks "Should they see photos already shared?" with two choices, neither picked', async () => {
    await openForm();
    expect(await screen.findByText('Should they see photos already shared?')).toBeTruthy();
    const all = screen.getByRole('radio', { name: 'Share all past photos' });
    const fresh = screen.getByRole('radio', { name: 'Only new photos' });
    expect(all.props.accessibilityState).toMatchObject({ checked: false });
    expect(fresh.props.accessibilityState).toMatchObject({ checked: false });
    // words under each, so nobody has to guess (grandparent-ux owns the final wording)
    expect(screen.getByText(/see every photo .* can already see/i)).toBeTruthy();
    expect(screen.getByText(/from today on, including older photos you add later/i)).toBeTruthy();
    expectGrandparentSafe();
  });

  it('BETA-AUD-19 "Make the invite" stays off until one is picked, and no invite is made', async () => {
    const { createInvite } = await openForm();
    const make = await screen.findByRole('button', { name: 'Make the invite' });
    expect(make.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(make);
    expect(await screen.findByText('Pick one above first.')).toBeTruthy();
    expect(createInvite).not.toHaveBeenCalled();
  });

  it('BETA-AUD-19 picking "Only new photos" sends history "new" with the invite', async () => {
    const { createInvite } = await openForm();
    fireEvent.press(await screen.findByRole('radio', { name: 'Only new photos' }));
    expect(screen.getByRole('radio', { name: 'Only new photos' }).props.accessibilityState).toMatchObject({ checked: true });
    const make = screen.getByRole('button', { name: 'Make the invite' });
    expect(make.props.accessibilityState?.disabled ?? false).toBe(false);
    fireEvent.press(make);
    expect(await screen.findByText('Works for 30 days.')).toBeTruthy();
    expect(createInvite).toHaveBeenCalledWith(expect.objectContaining({ history: 'new', circleIds: [FIXTURE.circles.dadSide.id, FIXTURE.circles.everyone.id] }));
  });

  it('BETA-AUD-19 picking "Share all past photos" sends history "all"', async () => {
    const { createInvite } = await openForm();
    fireEvent.press(await screen.findByRole('radio', { name: 'Share all past photos' }));
    fireEvent.press(screen.getByRole('button', { name: 'Make the invite' }));
    expect(await screen.findByText('Works for 30 days.')).toBeTruthy();
    expect(createInvite).toHaveBeenCalledWith(expect.objectContaining({ history: 'all' }));
  });
});

describe('PRIV-G2 / GRP-18 invite form: Everyone is ticked first and can be unticked', () => {
  async function openForm() {
    const be = FakeBackend.withFixture();
    const { api, createInvite } = spiedApi(be);
    await renderApp(<GroupsScreen />, { be, user: 'chase', deps: { api } });
    fireEvent.press(await screen.findByRole('button', { name: `Invite someone to ${DAD}` }));
    fireEvent.press(await screen.findByRole('radio', { name: 'Share all past photos' }));
    return { be, createInvite };
  }

  it('PRIV-G2 / GRP-18 "Also see photos sent to Everyone" starts ticked, and the invite names the group and Everyone', async () => {
    const { createInvite } = await openForm();
    const box = screen.getByRole('checkbox', { name: 'Also see photos sent to Everyone' });
    expect(box.props.accessibilityState).toMatchObject({ checked: true });
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: 'Make the invite' }));
    expect(await screen.findByText('Works for 30 days.')).toBeTruthy();
    expect(createInvite).toHaveBeenCalledWith(expect.objectContaining({ circleIds: [FIXTURE.circles.dadSide.id, FIXTURE.circles.everyone.id] }));
  });

  it('PRIV-G2 / GRP-18 unticking it sends only the group (a new invite adds Everyone only if named)', async () => {
    const { createInvite } = await openForm();
    fireEvent.press(screen.getByRole('checkbox', { name: 'Also see photos sent to Everyone' }));
    expect(screen.getByRole('checkbox', { name: 'Also see photos sent to Everyone' }).props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(screen.getByRole('button', { name: 'Make the invite' }));
    expect(await screen.findByText('Works for 30 days.')).toBeTruthy();
    expect(createInvite).toHaveBeenCalledWith(expect.objectContaining({ circleIds: [FIXTURE.circles.dadSide.id] }));
  });
});

describe('BETA-REPLY-12 the per-group reply switch is gone', () => {
  it('BETA-REPLY-12 the Groups screen has no "members see each other\'s replies" switch', async () => {
    await renderApp(<GroupsScreen />, { user: 'chase' });
    expect(await screen.findByText(DAD)).toBeTruthy();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByText("Members see each other's replies")).toBeNull();
  });

  it('BETA-REPLY-12 the API no longer offers setGroupRepliesShared', () => {
    const api = FakeBackend.withFixture().clientFor(FIXTURE.users.chase.id) as unknown as Record<string, unknown>;
    expect(api.setGroupRepliesShared).toBeUndefined();
  });
});

describe('BETA-REPLY-11 the comment box names who will read it', () => {
  const READERS = ['Memaw', 'Pawpaw', 'Granny', 'Chase', 'Danielle'];

  async function photosWithReaders() {
    const be = FakeBackend.withFixture();
    const { id } = await seedPost(be, { caption: 'Beach day' });
    const api = be.clientFor(null, { trackAppSession: true }) as HearthApi & { replyReaders?: unknown };
    const replyReaders = jest.fn(async (_post: string) => READERS);
    api.replyReaders = replyReaders;
    await renderApp(<PhotosScreen />, { be, user: 'jo', deps: { api } });
    await screen.findByText('Beach day');
    return { id, replyReaders };
  }

  it('BETA-REPLY-11 before sending: "Memaw, Pawpaw, Granny, Chase and Danielle will read this."', async () => {
    const { id, replyReaders } = await photosWithReaders();
    await waitFor(() => expect(replyReaders).toHaveBeenCalledWith(id));
    const card = screen.getByTestId(`post-${id}`);
    expect(await within(card).findByText('Memaw, Pawpaw, Granny, Chase and Danielle will read this.')).toBeTruthy();
    // never a vague "everyone", never a group name
    expect(within(card).queryByText(/everyone|Grandparents/i)).toBeNull();
  });

  it('BETA-REPLY-11 after Send it still names them', async () => {
    const { id } = await photosWithReaders();
    const card = screen.getByTestId(`post-${id}`);
    fireEvent.changeText(within(card).getByLabelText('Write something back to Chase'), 'So cute!');
    fireEvent.press(within(card).getByRole('button', { name: 'Send' }));
    expect(await within(card).findByText(/Memaw, Pawpaw, Granny, Chase and Danielle (will )?read it/)).toBeTruthy();
  });
});

describe('BETA-BULK-3 "Pick lots of photos" is for parents only (Oct 17 decision)', () => {
  const pickBulk = jest.fn(async () => ({ assets: [] }));

  it('BETA-BULK-3 Chase (owner) gets "Pick lots of photos"', async () => {
    await renderApp(<ShareScreen />, { user: 'chase', deps: { pickBulk } });
    expect(await screen.findByRole('button', { name: 'Pick up to 100 photos at once' })).toBeTruthy();
  });

  it('BETA-BULK-3 Alex (parent) gets it too', async () => {
    await renderApp(<ShareScreen />, { user: 'alex', deps: { pickBulk } });
    expect(await screen.findByRole('button', { name: 'Pick up to 100 photos at once' })).toBeTruthy();
  });

  it('BETA-BULK-3 a relative allowed to post (milestone 4) never gets a bulk picker', async () => {
    const be = FakeBackend.withFixture();
    const real = be.mySpaces.bind(be);
    jest.spyOn(be, 'mySpaces').mockImplementation((u) => real(u).map((s) => ({ ...s, can_post: true })));
    await renderApp(<ShareScreen />, { be, user: 'ruth', deps: { pickBulk } });
    expect(await screen.findByRole('header', { name: 'Share photos' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pick up to 100 photos at once' })).toBeNull();
    expect(screen.queryByText('Lots of photos?')).toBeNull();
  });
});

describe('BETA-TIME-2 a timeline card opens the full post (hearts and replies)', () => {
  it('BETA-TIME-2 tapping a timeline card opens that post with Love it and a reply box', async () => {
    const be = FakeBackend.withFixture();
    const { id } = await seedPost(be, { caption: 'Fourth of July', takenAt: '2024-07-04T16:00:00.000Z', photos: 1 });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Show photos by the date they were taken' }));
    const card = await screen.findByTestId(`timeline-${id}`);
    fireEvent.press(within(card).getByRole('button', { name: /^Open (this|Chase's) post/ }));
    const post = await screen.findByTestId(`post-${id}`);
    expect(within(post).getByRole('button', { name: 'Love it' })).toBeTruthy();
    expect(within(post).getByLabelText('Write something back to Chase')).toBeTruthy();
    expect(within(post).getByText('Fourth of July')).toBeTruthy();
    // and a labeled way back (no gesture-only actions)
    expect(screen.getByRole('button', { name: /^Back to (the )?(photos by date|timeline)/i })).toBeTruthy();
    expectGrandparentSafe();
  });

  it('BETA-TIME-2 a heart from the opened post sticks', async () => {
    const be = FakeBackend.withFixture();
    const { id } = await seedPost(be, { caption: 'Fourth of July', takenAt: '2024-07-04T16:00:00.000Z', photos: 1 });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Show photos by the date they were taken' }));
    fireEvent.press(within(await screen.findByTestId(`timeline-${id}`)).getByRole('button', { name: /^Open (this|Chase's) post/ }));
    fireEvent.press(within(await screen.findByTestId(`post-${id}`)).getByRole('button', { name: 'Love it' }));
    await waitFor(() => expect(be.state.hearts.some((h) => h.post === id && h.user === FIXTURE.users.jo.id)).toBe(true));
  });
});
