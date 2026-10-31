// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// SWIPE-1..5 (Chase, Oct 18): photos as one swipeable photo, with labeled Back / Next buttons and "2 of 7"
// words (no gesture-only actions). Since MOMENT-2 (Oct 24) a moment card in Photos shows a collage instead
// (moments.test.tsx); the swipe lives on inside an event's timeline (EVT-7), so these test it directly.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { MediaImage } from '../MediaImage';
import { PhotoSwipe } from '../PhotoSwipe';
import { PhotosScreen } from '../PhotosScreen';

const W = 328; // the card's width on a 360-wide phone

/** One post's photos in a swipe, as Grandma Jo gets them. */
async function one(opts: { photos: number; sizes?: Array<[number, number]> }) {
  const be = FakeBackend.withFixture();
  const { id } = await seedPost(be, { caption: 'At the lake', ...opts });
  const [post] = await be.clientFor(FIXTURE.users.jo.id).getFeed({ space: FIXTURE.space.id });
  return { be, id, cardId: `photos-${id}`, el: <PhotoSwipe postId={id} media={post!.media} /> };
}

/** The card reports its width (as a phone does after layout). */
function layout(id: string, width = W) {
  fireEvent(screen.getByTestId(`photos-${id}`), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 300 } } });
}

/** A finger swipe that lands on page `i`. */
function swipeTo(id: string, i: number, width = W) {
  fireEvent.scroll(screen.getByTestId(`photo-pager-${id}`), {
    nativeEvent: { contentOffset: { x: i * width, y: 0 }, layoutMeasurement: { width, height: 300 }, contentSize: { width: width * 10, height: 300 } },
  });
}

const flat = (s: unknown) => StyleSheet.flatten(s as never) as { width?: number; height?: number };

describe('SWIPE: a post\'s photos, one at a time', () => {
  it('SWIPE-1 a 7-photo post shows one full-width photo at a time and a swipe reaches every photo', async () => {
    const { be, id, cardId, el } = await one({ photos: 7 });
    const { nav } = await renderApp(el, { be, user: 'jo' });
    const card = await screen.findByTestId(cardId);
    layout(id);
    const pager = within(card).getByTestId(`photo-pager-${id}`);
    expect(pager.props.horizontal).toBe(true);
    expect(pager.props.pagingEnabled).toBe(true);
    const pages = within(card).getAllByTestId(/^photo-page-/);
    expect(pages).toHaveLength(7);
    for (const p of pages) expect(flat(p.props.style).width).toBe(W);
    expect(within(card).getByText('1 of 7')).toBeTruthy();
    act(() => swipeTo(id, 6));
    expect(await within(card).findByText('7 of 7')).toBeTruthy();
    fireEvent.press(within(card).getByRole('button', { name: 'Open photo 7 of 7 full screen' }));
    expect(nav.openViewer).toHaveBeenCalledWith(id, 6);
  });

  it('SWIPE-1 the old stacked photos and "See all N photos" are gone', async () => {
    const { be, id, cardId, el } = await one({ photos: 6 });
    await renderApp(el, { be, user: 'jo' });
    await screen.findByTestId(cardId);
    expect(screen.queryByText(/See all/)).toBeNull();
    expect(screen.queryByRole('button', { name: /See all/ })).toBeNull();
  });

  it('SWIPE-2 labeled "◀ Back" / "Next ▶" buttons move the photo, hidden at the ends, with "2 of 3" words', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { be, id, cardId, el } = await one({ photos: 3 });
    await renderApp(el, { be, user: 'jo' });
    const card = await screen.findByTestId(cardId);
    layout(id);
    expect(within(card).getByText('1 of 3')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Previous photo' })).toBeNull();
    const next = within(card).getByRole('button', { name: 'Next photo' });
    expect(within(next).getByText('Next ▶')).toBeTruthy();
    fireEvent.press(next);
    expect(await within(card).findByText('2 of 3')).toBeTruthy();
    const back = within(card).getByRole('button', { name: 'Previous photo' });
    expect(within(back).getByText('◀ Back')).toBeTruthy();
    // A screen reader hears the new place.
    const where = within(card).getByLabelText('Photo 2 of 3');
    expect(where.props.accessibilityLiveRegion).toBe('polite');
    expect(announce).toHaveBeenCalledWith('Photo 2 of 3');
    fireEvent.press(within(card).getByRole('button', { name: 'Next photo' }));
    expect(await within(card).findByText('3 of 3')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Next photo' })).toBeNull();
    fireEvent.press(within(card).getByRole('button', { name: 'Previous photo' }));
    expect(await within(card).findByText('2 of 3')).toBeTruthy();
    announce.mockRestore();
  });

  it('SWIPE-2 is grandparent-safe (48 pt targets, 17 pt text, every button labeled)', async () => {
    const { be, id, cardId, el } = await one({ photos: 3 });
    await renderApp(el, { be, user: 'jo' });
    await screen.findByTestId(cardId);
    layout(id);
    fireEvent.press(screen.getByRole('button', { name: 'Next photo' }));
    await screen.findByText('2 of 3');
    expectGrandparentSafe();
  });

  it('SWIPE-3 tapping the photo opens the viewer at that photo, and the card stays on it', async () => {
    const { be, id, cardId, el } = await one({ photos: 3 });
    const { nav, unmount } = await renderApp(el, { be, user: 'jo' });
    const card = await screen.findByTestId(cardId);
    layout(id);
    fireEvent.press(within(card).getByRole('button', { name: 'Next photo' }));
    fireEvent.press(await within(card).findByRole('button', { name: 'Open photo 2 of 3 full screen' }));
    expect(nav.openViewer).toHaveBeenCalledWith(id, 1);
    expect(within(card).getByText('2 of 3')).toBeTruthy();
    // Coming back from the viewer (even if Photos was rebuilt) keeps the card on that photo.
    unmount();
    await renderApp(el, { be, user: 'jo' });
    const again = await screen.findByTestId(cardId);
    expect(within(again).getByText('2 of 3')).toBeTruthy();
  });


  it('SWIPE-5 one height per post (from the first photo), so the card does not jump between shapes', async () => {
    const { be, id, cardId, el } = await one({ photos: 3, sizes: [[2048, 1536], [1080, 1920], [2000, 2000]] });
    await renderApp(el, { be, user: 'jo' });
    const card = await screen.findByTestId(cardId);
    layout(id, 300);
    const h = 300 / (2048 / 1536);
    expect(flat(within(card).getByTestId(`photo-pager-${id}`).props.style).height).toBe(h);
    for (const p of within(card).getAllByTestId(/^photo-page-/)) expect(flat(p.props.style).height).toBe(h);
    act(() => swipeTo(id, 1, 300));
    await within(card).findByText('2 of 3');
    expect(flat(within(card).getByTestId(`photo-pager-${id}`).props.style).height).toBe(h);
  });

  it('SWIPE-5 a very tall first photo is clamped like today (no taller than width / 0.6)', async () => {
    const { be, id, cardId, el } = await one({ photos: 2, sizes: [[1000, 3000], [2048, 1536]] });
    await renderApp(el, { be, user: 'jo' });
    const card = await screen.findByTestId(cardId);
    layout(id, 300);
    expect(flat(within(card).getByTestId(`photo-pager-${id}`).props.style).height).toBe(500);
  });

  it('SWIPE lazy-load: a 12-photo post loads only the shown photo and its neighbours', async () => {
    const { be, id, cardId, el } = await one({ photos: 12 });
    const api = be.clientFor(null, { trackAppSession: true });
    const get = jest.spyOn(api, 'getObject');
    await renderApp(el, { be, user: 'jo', deps: { api } });
    const card = await screen.findByTestId(cardId);
    layout(id);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(within(card).UNSAFE_queryAllByType(MediaImage).length).toBeLessThanOrEqual(3);
    expect(get.mock.calls.length).toBeLessThanOrEqual(6); // thumb + photo for at most 3
    act(() => swipeTo(id, 5));
    await within(card).findByText('6 of 12');
    expect(within(card).UNSAFE_queryAllByType(MediaImage).length).toBeLessThanOrEqual(3);
  });

  it('EVT-2 + MOMENT-2: an event card in Photos shows the same moment collage, and opens the event', async () => {
    const be = FakeBackend.withFixture();
    const chase = be.clientFor(FIXTURE.users.chase.id);
    const bday = await chase.createLevel(FIXTURE.space.id, 'event', "Chase's birthday");
    await chase.placePerson(bday, FIXTURE.users.jo.id, 'all');
    const { id } = await seedPost(be, { caption: 'Cake', circles: [bday], photos: 3 });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const ev = await screen.findByTestId(`event-card-${bday}`);
    expect(within(ev).getByTestId(`collage-${id}`)).toBeTruthy();
    expect(within(ev).getByRole('button', { name: 'Open photo 3 of 3 full screen' })).toBeTruthy();
    expect(within(ev).getByRole('button', { name: "Open Chase's birthday" })).toBeTruthy();
  });

});
