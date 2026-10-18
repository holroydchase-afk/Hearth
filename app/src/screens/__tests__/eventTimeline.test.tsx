// EVT-6..9 (Chase, Oct 18 "Yes build both"): inside an event, one timeline of everyone's photos by when they were
// taken (oldest first), a header per day, 1-hour moments with "From Rachel" on each photo, name buttons to see one
// person's photos, and "Added later" for photos with no capture time. Written first: red until EventsScreen catches up.
import { fireEvent, screen, within } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp, screenWords } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';

/** Local time, Oct 2026 (the 24th is a Saturday). */
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();
const EV = 'Beach day';

async function beach() {
  const be = FakeBackend.withFixture();
  const chase = be.clientFor(FIXTURE.users.chase.id);
  const ev = await chase.createLevel(FIXTURE.space.id, 'event', EV);
  for (const u of [FIXTURE.users.jo.id, FIXTURE.users.alex.id]) await chase.placePerson(ev, u, 'all');
  const alex = FIXTURE.users.alex.id;
  await seedPost(be, { caption: 'Sandcastle', circles: [ev], photos: 2, takenAt: at(24, 15, 10) });
  await seedPost(be, { caption: 'Waves', circles: [ev], photos: 1, takenAt: at(24, 15, 40), author: alex });
  await seedPost(be, { caption: 'Breakfast', circles: [ev], photos: 1, takenAt: at(25, 9, 0), author: alex });
  await seedPost(be, { caption: 'Scanned later', circles: [ev], photos: 1, takenAt: null });
  return { be, ev };
}

async function openEvent(be: FakeBackend) {
  await renderApp(<PhotosScreen />, { be, user: 'jo' });
  fireEvent.press(await screen.findByRole('button', { name: 'See events' }));
  fireEvent.press(await screen.findByRole('button', { name: `Open ${EV}` }));
  expect(await screen.findByRole('header', { name: EV })).toBeTruthy();
}

describe('EVT-6..9 the event timeline', () => {
  it('EVT-6 day headers, oldest first: "Saturday, Oct 24" then "Sunday, Oct 25"', async () => {
    const { be } = await beach();
    await openEvent(be);
    const days = screen.getAllByRole('header').map((h) => h.props.children).filter((t) => /day, Oct/.test(String(t)));
    expect(days).toEqual(['Saturday, Oct 24', 'Sunday, Oct 25']);
    expectGrandparentSafe();
    expect(screenWords()).not.toMatch(/\b(feed|circles?)\b/i);
  });

  it('EVT-7 a moment line and one swipe through its photos, each saying who it is from', async () => {
    const { be } = await beach();
    await openEvent(be);
    expect(screen.getByText('3:10 pm · 3 photos from Chase and Alex')).toBeTruthy();
    expect(screen.getByText('9:00 am · 1 photo from Alex')).toBeTruthy();
    const moment = screen.getAllByTestId(/^moment-/)[0]!;
    expect(within(moment).getByText('1 of 3')).toBeTruthy();
    expect(within(moment).getByText('From Chase')).toBeTruthy();
    fireEvent.press(within(moment).getByRole('button', { name: 'Next photo' }));
    fireEvent.press(within(moment).getByRole('button', { name: 'Next photo' }));
    expect(await within(moment).findByText('3 of 3')).toBeTruthy();
    expect(within(moment).getByText('From Alex')).toBeTruthy();
    expect(within(moment).getByText('Waves')).toBeTruthy();
  });

  it('EVT-8 name buttons (Everyone, then each person) show one person\'s photos; buttons, not gestures', async () => {
    const { be } = await beach();
    await openEvent(be);
    const everyone = screen.getByRole('button', { name: "Show everyone's photos" });
    expect(everyone.props.accessibilityState.selected).toBe(true);
    expect(within(everyone).getByText('Everyone')).toBeTruthy();
    const names = screen.getAllByRole('button', { name: /^Show photos from / }).map((b) => b.props.accessibilityLabel);
    expect(names).toEqual(['Show photos from Alex', 'Show photos from Chase']);
    fireEvent.press(screen.getByRole('button', { name: 'Show photos from Alex' }));
    expect(await screen.findByText('3:40 pm · 1 photo from Alex')).toBeTruthy();
    expect(screen.queryByText(/from Chase and Alex/)).toBeNull();
    expect(screen.queryByText('Added later')).toBeNull(); // Chase's undated photo is filtered out too
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: "Show everyone's photos" }));
    expect(await screen.findByText('3:10 pm · 3 photos from Chase and Alex')).toBeTruthy();
  });

  it('EVT-9 photos with no capture time go last under "Added later"', async () => {
    const { be } = await beach();
    await openEvent(be);
    const headers = screen.getAllByRole('header').map((h) => String(h.props.children));
    expect(headers.slice(-1)).toEqual(['Added later']);
    expect(screen.getByText('1 photo from Chase')).toBeTruthy();
  });
});
