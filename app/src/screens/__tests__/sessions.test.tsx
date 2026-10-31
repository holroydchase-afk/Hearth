// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// MOMENT-7 (Oct 24) replaces SESS-1..3 (Oct 18): Photos no longer merges a sender's posts within an hour into one
// swipe. Each upload is its own moment card, so its caption, hearts, replies and Delete are plainly its own.
// feed/sessions.ts stays (unused on screen) until Chase confirms; see the PR.
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { uuid } from '../../crypto/random';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp, screenWords } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';

/** Chase shares three posts to Dad's side a moment apart (2 + 3 + 1 photos). */
async function threeUploads() {
  const be = FakeBackend.withFixture();
  const lake = await seedPost(be, { caption: 'At the lake', photos: 2 });
  const dock = await seedPost(be, { caption: 'On the dock', photos: 3 });
  const boat = await seedPost(be, { caption: 'Boat ride', photos: 1 });
  await be.clientFor(FIXTURE.users.alex.id).addComment({ clientId: uuid(), post: lake.id, body: 'Look at her go' });
  return { be, lake: lake.id, dock: dock.id, boat: boat.id };
}

describe('MOMENT-7 one card per upload, even within an hour', () => {
  it('MOMENT-7 three uploads minutes apart are three cards, each with its own caption and photos', async () => {
    const { be, lake, dock, boat } = await threeUploads();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const cards = await Promise.all([lake, dock, boat].map((id) => screen.findByTestId(`post-${id}`)));
    expect(within(cards[0]!).getByText('At the lake')).toBeTruthy();
    expect(within(cards[1]!).getByText('On the dock')).toBeTruthy();
    expect(within(cards[1]!).getByRole('button', { name: 'Open photo 3 of 3 full screen' })).toBeTruthy();
    expect(within(cards[2]!).getByText('Boat ride')).toBeTruthy();
    expect(screen.queryByTestId(/^session-/)).toBeNull();
    expectGrandparentSafe();
    expect(screenWords()).not.toMatch(/\b(feed|circles?|session)\b/i);
  });

  it('MOMENT-7 a reply shows only on its own card, and a heart goes to the card tapped', async () => {
    const { be, lake, dock } = await threeUploads();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    expect(await within(await screen.findByTestId(`post-${lake}`)).findByText(/Look at her go/)).toBeTruthy();
    const dockCard = screen.getByTestId(`post-${dock}`);
    expect(within(dockCard).queryByText(/Look at her go/)).toBeNull();
    fireEvent.press(within(dockCard).getByRole('button', { name: 'Love it' }));
    await waitFor(() => expect(be.state.hearts).toEqual([{ post: dock, user: FIXTURE.users.jo.id, emoji: '❤️' }]));
    expect(await within(dockCard).findByText('❤️ 1')).toBeTruthy();
  });

  it('MOMENT-7 a reply written from a card goes to that card\'s post', async () => {
    const { be, boat } = await threeUploads();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const card = await screen.findByTestId(`post-${boat}`);
    fireEvent.changeText(within(card).getByLabelText('Write something back to Chase'), 'So fun');
    fireEvent.press(within(card).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(Object.values(be.state.comments).some((c) => c.post === boat && c.body === 'So fun')).toBe(true));
  });

  it('MOMENT-7 the sender deletes one upload; the others stay', async () => {
    const { be, lake, dock } = await threeUploads();
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    fireEvent.press(within(await screen.findByTestId(`post-${dock}`)).getByRole('button', { name: 'More for these photos' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Delete these 3 photos' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Yes, delete them' }));
    await waitFor(() => expect(be.state.posts[dock]!.deleted).toBe(true));
    expect(be.state.posts[lake]!.deleted).toBe(false);
    expect(await screen.findByTestId(`post-${lake}`)).toBeTruthy();
  });
});

describe('separate senders and groups stay separate', () => {
  it('the sender sees posts to different groups as separate cards', async () => {
    const be = FakeBackend.withFixture();
    const a = await seedPost(be, { caption: 'For Dad\'s side', circles: [FIXTURE.circles.dadSide.id] });
    const b = await seedPost(be, { caption: 'For both sides', circles: [FIXTURE.circles.dadSide.id, FIXTURE.circles.momSide.id] });
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    expect(await screen.findByTestId(`post-${a.id}`)).toBeTruthy();
    expect(screen.getByTestId(`post-${b.id}`)).toBeTruthy();
  });

  it('posts from different senders stay separate', async () => {
    const be = FakeBackend.withFixture();
    const a = await seedPost(be, { caption: 'From Chase' });
    const b = await seedPost(be, { caption: 'From Alex', author: FIXTURE.users.alex.id });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    expect(await screen.findByTestId(`post-${a.id}`)).toBeTruthy();
    expect(screen.getByTestId(`post-${b.id}`)).toBeTruthy();
  });
});
