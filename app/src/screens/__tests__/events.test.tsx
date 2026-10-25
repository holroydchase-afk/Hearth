// SPEC-GROUPS v2, EVT-2..4 (app-now): event card and update line in Photos, and the Events section
// (a labeled button at the top of Photos, not a new tab). Written first (Oct 18): red until PhotosScreen catches up.
import { fireEvent, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp, screenWords } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';
import { tabsFor } from '../TabBar';

const BDAY = "Chase's birthday";

/** Birthday (Jo is in it): Cake first, a plain post, then two later posts (2 + 1 photos). Beach week: Jo too, started later. */
async function family(opts: { beach?: boolean } = {}) {
  const be = FakeBackend.withFixture();
  const chase = be.clientFor(FIXTURE.users.chase.id);
  const bday = await chase.createLevel(FIXTURE.space.id, 'event', BDAY);
  await chase.placePerson(bday, FIXTURE.users.jo.id, 'all');
  const to = [bday, FIXTURE.circles.momSide.id]; // Nana Ruth sees these only through Mom's side
  const first = await seedPost(be, { caption: 'Cake', circles: to });
  await seedPost(be, { caption: 'Park day', circles: [FIXTURE.circles.dadSide.id, FIXTURE.circles.momSide.id] });
  let beach: string | null = null;
  if (opts.beach) {
    beach = await chase.createLevel(FIXTURE.space.id, 'event', 'Beach week');
    await chase.placePerson(beach, FIXTURE.users.jo.id, 'all');
    await seedPost(be, { caption: 'Sandcastle', circles: [beach] });
  }
  await seedPost(be, { caption: 'Candles', circles: to, photos: 2 });
  await seedPost(be, { caption: 'Presents', circles: to, photos: 1 });
  return { be, bday, beach, first: first.id };
}

describe('EVT-2 event card in Photos', () => {
  it('EVT-2 the first post of an event shows as a bigger event card with the event\'s name', async () => {
    const { be, bday } = await family();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const card = await screen.findByTestId(`event-card-${bday}`);
    const name = within(card).getByRole('header', { name: BDAY });
    expect(within(card).getByText('Cake')).toBeTruthy();
    // bigger: the event's name is in the big display size, not the 17 pt of a post's sender
    expect(Number(StyleSheet.flatten(name.props.style).fontSize)).toBeGreaterThanOrEqual(27);
    expect(within(card).getByRole('button', { name: `Open ${BDAY}` })).toBeTruthy();
    expect(screen.getByText('Park day')).toBeTruthy();
    expectGrandparentSafe();
    expect(screenWords()).not.toMatch(/\b(feed|circles?)\b/i);
  });
});

describe('EVT-3 later event posts in Photos', () => {
  it('EVT-3 Chase (Oct 18): later posts show as ordinary cards in Photos, no update line; the event card still opens all of them', async () => {
    const { be } = await family();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    // MOMENT-7 (Oct 24): Candles and Presents are each their own ordinary card.
    expect(await screen.findByText('Candles')).toBeTruthy();
    expect(screen.getByText('Presents')).toBeTruthy();
    expect(screen.queryByText(`3 new photos in ${BDAY}`)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: `Open ${BDAY}` }));
    expect(await screen.findByRole('header', { name: BDAY })).toBeTruthy();
    // EVT-6..9 (Oct 18): inside, one timeline; these have no capture time, so all 4 are under "Added later".
    expect(screen.getByText('4 photos from Chase')).toBeTruthy();
    expect(screen.getByText('Cake')).toBeTruthy();
    expect(screen.queryByText('Park day')).toBeNull();
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: 'Back to Photos' }));
    expect(await screen.findByText('Candles')).toBeTruthy();
  });

  it('EVT-3 / EVT-4 a relative who sees the posts only through another group gets ordinary cards and never the event\'s name', async () => {
    const { be } = await family();
    await renderApp(<PhotosScreen />, { be, user: 'ruth' });
    // MOMENT-7 (Oct 24): to her all four are ordinary posts from Chase, one card each.
    expect(await screen.findByText('Cake')).toBeTruthy();
    expect(screen.getAllByTestId(/^post-/)).toHaveLength(4);
    expect(screen.queryByTestId(/^event-card-/)).toBeNull();
    expect(screenWords()).not.toContain('birthday');
    expect(screen.queryByRole('button', { name: 'See events' })).toBeNull();
  });
});

describe('EVT-4 Events section (a button at the top of Photos)', () => {
  it('EVT-4 a member of two events sees both, newest first, each opening its posts', async () => {
    const { be } = await family({ beach: true });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'See events' }));
    expect(await screen.findByRole('header', { name: 'Events' })).toBeTruthy();
    const opens = screen.getAllByRole('button', { name: /^Open / }).map((b) => b.props.accessibilityLabel);
    expect(opens).toEqual(['Open Beach week', `Open ${BDAY}`]);
    expect(screen.getByText('1 photo')).toBeTruthy(); // Beach week; the birthday has 1 + 2 + 1 = 4
    expect(screen.getByText('4 photos')).toBeTruthy();
    expectGrandparentSafe();
    expect(screenWords()).not.toMatch(/\b(feed|circles?)\b/i);

    fireEvent.press(screen.getByRole('button', { name: 'Open Beach week' }));
    expect(await screen.findByRole('header', { name: 'Beach week' })).toBeTruthy();
    expect(screen.getByText('Sandcastle')).toBeTruthy();
    expect(screen.queryByText('Cake')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Back to events' }));
    fireEvent.press(await screen.findByRole('button', { name: `Open ${BDAY}` }));
    expect(await screen.findByText('4 photos from Chase')).toBeTruthy(); // EVT-9: no capture times, "Added later"
    expect(screen.getByText('Cake')).toBeTruthy();
    expect(screen.queryByText('Sandcastle')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Back to events' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Back to Photos' }));
    expect(await screen.findByRole('button', { name: 'See events' })).toBeTruthy();
  });

  it('EVT-4 no events, no Events button; viewers\' tabs stay Photos and Help', async () => {
    const be = FakeBackend.withFixture();
    await seedPost(be, { caption: 'Just a photo' });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    expect(await screen.findByText('Just a photo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'See events' })).toBeNull();
    expect(tabsFor('viewer').map((t) => t.label)).toEqual(['Photos', 'Help']);
  });

  it('EVT-4 parents see the events too', async () => {
    const { be } = await family();
    await renderApp(<PhotosScreen />, { be, user: 'alex' });
    fireEvent.press(await screen.findByRole('button', { name: 'See events' }));
    expect(await screen.findByRole('button', { name: `Open ${BDAY}` })).toBeTruthy();
  });
});
