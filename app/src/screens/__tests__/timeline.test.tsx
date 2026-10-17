// BETA-TIME-1..4 on screen: Photos stays newest-shared-first, old photos go in an
// "Added from earlier" card, "Show by date" opens the timeline, "Jump to year" lists years.
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp, screenWords } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';

/** A bulk import of old photos (Jul 2024, Dec 2023) plus one new post, all shared today. */
async function family() {
  const be = FakeBackend.withFixture();
  await seedPost(be, { caption: 'Christmas 2023', takenAt: '2023-12-25T17:00:00.000Z', photos: 2 });
  await seedPost(be, { caption: 'Fourth of July', takenAt: '2024-07-04T16:00:00.000Z', photos: 3 });
  await seedPost(be, { caption: 'Pumpkins today', photos: 1 });
  return be;
}

describe('BETA-TIME-1 Photos with old photos added', () => {
  it('BETA-TIME-1 new posts stay on top; old ones go in one "Added from earlier" card', async () => {
    await renderApp(<PhotosScreen />, { be: await family(), user: 'jo' });
    expect(await screen.findByText('Pumpkins today')).toBeTruthy();
    const card = screen.getByTestId('earlier-card-' + FIXTURE.users.chase.id);
    expect(within(card).getByRole('header', { name: 'Added from earlier' })).toBeTruthy();
    expect(within(card).getByText('Chase added 5 older photos.')).toBeTruthy();
    expect(within(card).getByRole('button', { name: "See Chase's older photos by date" })).toBeTruthy();
    // the old posts themselves don't take over the list
    expect(screen.queryByText('Fourth of July')).toBeNull();
    expect(screen.queryByText('Christmas 2023')).toBeNull();
  });

  it('BETA-TIME-1/2 "See them" opens the timeline at that month', async () => {
    await renderApp(<PhotosScreen />, { be: await family(), user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: "See Chase's older photos by date" }));
    expect(await screen.findByRole('header', { name: 'July 2024' })).toBeTruthy();
    expect(screen.getByText('Fourth of July')).toBeTruthy();
    expect(screen.queryByText('Pumpkins today')).toBeNull(); // newer than the month it opened at
    expect(screen.getByRole('button', { name: 'Show the newest photos first' })).toBeTruthy();
  });
});

describe('BETA-TIME-2 timeline ("Show by date")', () => {
  it('BETA-TIME-2 a labeled button opens the timeline: newest taken first, with month and year headers', async () => {
    await renderApp(<PhotosScreen />, { be: await family(), user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Show photos by the date they were taken' }));
    expect(await screen.findByRole('header', { name: 'Photos by date' })).toBeTruthy();
    await screen.findByText('Christmas 2023');
    const headers = screen.getAllByRole('header').map((h) => h.props.accessibilityLabel ?? h.props.children);
    const months = headers.filter((h) => /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/.test(String(h)));
    expect(months.slice(1)).toEqual(['July 2024', 'December 2023']);
    const words = screenWords();
    expect(words.indexOf('Pumpkins today')).toBeLessThan(words.indexOf('Fourth of July'));
    expect(words.indexOf('Fourth of July')).toBeLessThan(words.indexOf('Christmas 2023'));
    expect(screen.getByText(/Taken .*Jul 4/)).toBeTruthy();
  });

  it('BETA-TIME-2 "Back to Photos" returns to newest shared first', async () => {
    await renderApp(<PhotosScreen />, { be: await family(), user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Show photos by the date they were taken' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Back to Photos' }));
    expect(await screen.findByRole('header', { name: 'Photos of Mia and Leo' })).toBeTruthy();
  });

  it('BETA-TIME-3 the timeline shows a relative only what was shared with her', async () => {
    const be = await family();
    await seedPost(be, { caption: 'Mom side only', takenAt: '2024-07-05T16:00:00.000Z', circles: [FIXTURE.circles.momSide.id] });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Show photos by the date they were taken' }));
    await screen.findByText('Fourth of July');
    expect(screen.queryByText('Mom side only')).toBeNull();
  });
});

describe('BETA-TIME-4 "Jump to year"', () => {
  it('BETA-TIME-4 lists years newest first with photo counts; a year opens the timeline there', async () => {
    await renderApp(<PhotosScreen />, { be: await family(), user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Show photos by the date they were taken' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Jump to year' }));
    const y2024 = await screen.findByRole('button', { name: 'See 2024, 3 photos' });
    const y2023 = screen.getByRole('button', { name: 'See 2023, 2 photos' });
    const all = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel as string).filter((l) => /^See \d{4}/.test(l));
    expect(all.indexOf('See 2024, 3 photos')).toBeLessThan(all.indexOf('See 2023, 2 photos'));
    expect(y2023).toBeTruthy();
    fireEvent.press(y2024);
    expect(await screen.findByRole('header', { name: 'July 2024' })).toBeTruthy();
    expect(screen.queryByText('Pumpkins today')).toBeNull();
  });
});

describe('BETA-TIME grandparent rules', () => {
  it('BETA-TIME-1..4 Photos, timeline and years are grandparent-safe (labels, 48 pt, 17 pt+)', async () => {
    await renderApp(<PhotosScreen />, { be: await family(), user: 'jo' });
    await screen.findByText('Pumpkins today');
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: 'Show photos by the date they were taken' }));
    await screen.findByText('Christmas 2023');
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: 'Jump to year' }));
    await screen.findByRole('button', { name: 'See 2024, 3 photos' });
    expectGrandparentSafe();
    await waitFor(() => expect(screenWords()).not.toMatch(/timeline|feed|circle|sort/i));
  });
});
