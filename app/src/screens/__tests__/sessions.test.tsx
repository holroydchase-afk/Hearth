// SESS-1..3 (Chase, Oct 18 "Yes build both"): a 1-hour session in Photos, display only. Posts by one sender to the
// same groups within an hour of each other show as one entry with one swipe; hearts, replies and Delete belong to
// the post holding the photo on screen. Nothing changes server-side. Written first: red until PhotosScreen catches up.
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { uuid } from '../../crypto/random';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp, screenWords } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';

/** Chase shares three posts to Dad's side a moment apart (2 + 3 + 1 photos): one session. */
async function session() {
  const be = FakeBackend.withFixture();
  const lake = await seedPost(be, { caption: 'At the lake', photos: 2 });
  const dock = await seedPost(be, { caption: 'On the dock', photos: 3 });
  const boat = await seedPost(be, { caption: 'Boat ride', photos: 1 });
  await be.clientFor(FIXTURE.users.alex.id).addComment({ clientId: uuid(), post: lake.id, body: 'Look at her go' });
  return { be, lake: lake.id, dock: dock.id, boat: boat.id };
}

const next = (card: ReturnType<typeof screen.getByTestId>) => fireEvent.press(within(card).getByRole('button', { name: 'Next photo' }));

describe('SESS-1 one entry per 1-hour session', () => {
  it('SESS-1 three posts become one entry: the sender, the date, "6 photos" and one swipe through all of them in posting order', async () => {
    const { be, lake, dock, boat } = await session();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const card = await screen.findByTestId(`session-${lake}`);
    expect(within(card).getByText('Chase')).toBeTruthy();
    expect(within(card).getByText('6 photos')).toBeTruthy();
    expect(within(card).getByText('1 of 6')).toBeTruthy();
    expect(within(card).getAllByTestId(/^photo-page-/)).toHaveLength(6);
    for (const id of [lake, dock, boat]) expect(screen.queryByTestId(`post-${id}`)).toBeNull();
    expectGrandparentSafe();
    expect(screenWords()).not.toMatch(/\b(feed|circles?|session)\b/i);
  });

  it('SESS-1 tapping a photo opens the viewer on that photo of its own post', async () => {
    const { be, lake, dock } = await session();
    const { nav } = await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const card = await screen.findByTestId(`session-${lake}`);
    next(card); next(card); next(card);
    fireEvent.press(await within(card).findByRole('button', { name: 'Open photo 4 of 6 full screen' }));
    expect(nav.openViewer).toHaveBeenCalledWith(dock, 1);
  });
});

describe('SESS-2 what never merges (on screen)', () => {
  it('SESS-2 the sender sees posts to different groups as separate entries', async () => {
    const be = FakeBackend.withFixture();
    const a = await seedPost(be, { caption: 'For Dad\'s side', circles: [FIXTURE.circles.dadSide.id] });
    const b = await seedPost(be, { caption: 'For both sides', circles: [FIXTURE.circles.dadSide.id, FIXTURE.circles.momSide.id] });
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    expect(await screen.findByTestId(`post-${a.id}`)).toBeTruthy();
    expect(screen.getByTestId(`post-${b.id}`)).toBeTruthy();
    expect(screen.queryByTestId(/^session-/)).toBeNull();
  });

  it('SESS-2 posts from different senders stay separate', async () => {
    const be = FakeBackend.withFixture();
    const a = await seedPost(be, { caption: 'From Chase' });
    const b = await seedPost(be, { caption: 'From Alex', author: FIXTURE.users.alex.id });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    expect(await screen.findByTestId(`post-${a.id}`)).toBeTruthy();
    expect(screen.getByTestId(`post-${b.id}`)).toBeTruthy();
  });
});

describe('SESS-3 hearts, replies and Delete follow the photo on screen', () => {
  it('SESS-3 the caption, replies and hearts shown are those of the post holding the current photo', async () => {
    const { be, lake, dock } = await session();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const card = await screen.findByTestId(`session-${lake}`);
    expect(within(card).getByText('At the lake')).toBeTruthy();
    expect(await within(card).findByText(/Look at her go/)).toBeTruthy();
    expect(within(card).queryByText('On the dock')).toBeNull();
    next(card); next(card); // photo 3 of 6 is the dock's first
    expect(await within(card).findByText('On the dock')).toBeTruthy();
    expect(within(card).queryByText('At the lake')).toBeNull();
    expect(within(card).queryByText(/Look at her go/)).toBeNull();
    fireEvent.press(within(card).getByRole('button', { name: 'Love it' }));
    await waitFor(() => expect(be.state.hearts).toEqual([{ post: dock, user: FIXTURE.users.jo.id }]));
    expect(within(card).getByText('1 person loves this')).toBeTruthy();
    expectGrandparentSafe();
  });

  it('SESS-3 a reply goes to the post on screen', async () => {
    const { be, lake, boat } = await session();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const card = await screen.findByTestId(`session-${lake}`);
    for (let i = 0; i < 5; i += 1) next(card);
    expect(await within(card).findByText('Boat ride')).toBeTruthy();
    fireEvent.changeText(within(card).getByLabelText('Write something back to Chase'), 'So fun');
    fireEvent.press(within(card).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(Object.values(be.state.comments).some((c) => c.post === boat && c.body === 'So fun')).toBe(true));
  });

  it('SESS-3 the sender deletes only the post on screen; the rest of the session stays', async () => {
    const { be, lake, dock } = await session();
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    const card = await screen.findByTestId(`session-${lake}`);
    next(card); next(card);
    expect(await within(card).findByText('On the dock')).toBeTruthy();
    fireEvent.press(within(card).getByRole('button', { name: 'Delete this photo' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Yes, delete it' }));
    await waitFor(() => expect(be.state.posts[dock]!.deleted).toBe(true));
    expect(be.state.posts[lake]!.deleted).toBe(false);
    const after = await screen.findByTestId(`session-${lake}`);
    expect(await within(after).findByText('3 photos')).toBeTruthy();
  });
});
