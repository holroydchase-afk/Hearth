// grandparent-ux review of the SPEC-GROUPS first build (Oct 17). Written first: red until the screens catch up.
// UX-G1..G6 are this review's acceptance criteria; the BETA ID each serves is in the title.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FakeBackend } from '../../api/fake/FakeBackend';
import type { Circle } from '../../api/HearthApi';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { GroupsScreen } from '../GroupsScreen';
import { MeScreen } from '../MeScreen';
import { ShareScreen } from '../ShareScreen';

const SHAPE: Circle[] = [
  { circle_id: 'e1', name: 'Charleston trip', member_count: 3, member_names: ['Pawpaw', 'Granny', 'Tess'], kind: 'event', parent_ids: [] },
  { circle_id: 'g1', name: "Mom's side", member_count: 4, member_names: ['Memaw', 'Pawpaw', 'Granny', 'Tess'], kind: 'group', parent_ids: [] },
  { circle_id: 'h1', name: "Pawpaw and Granny's house", member_count: 2, member_names: ['Pawpaw', 'Granny'], kind: 'household', parent_ids: ['g1', 'e1'] },
  { circle_id: 'all', name: 'Everyone', member_count: 6, member_names: ['Memaw', 'Pawpaw', 'Granny', 'Tess', 'Gammy', 'Grandaddy'], kind: 'everyone', parent_ids: [] },
];

function shapedApi() {
  const be = FakeBackend.withFixture();
  const api = be.clientFor(null, { trackAppSession: true });
  jest.spyOn(api, 'myCircles').mockResolvedValue(SHAPE);
  return { be, api };
}

describe('UX-G share sheet words (BETA-AUD-17)', () => {
  it('UX-G1 BETA-AUD-17 picking Everyone says "Everyone in the family will see these." (never "Only Everyone")', async () => {
    const { be, api } = shapedApi();
    await renderApp(<ShareScreen />, { be, user: 'chase', deps: { api } });
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Everyone, 6 people' }));
    expect(await screen.findByText('Everyone in the family will see these.')).toBeTruthy();
    expect(screen.queryByText(/Only Everyone/)).toBeNull();
  });

  it('UX-G2 BETA-AUD-17 Everyone first, then a "Groups" heading, then an "Events" heading', async () => {
    const { be, api } = shapedApi();
    await renderApp(<ShareScreen />, { be, user: 'chase', deps: { api } });
    await screen.findByRole('checkbox', { name: 'Everyone, 6 people' });
    const boxes = screen.getAllByRole('checkbox').map((b) => b.props.accessibilityLabel as string);
    expect(boxes[0]).toBe('Everyone, 6 people');
    expect(boxes[boxes.length - 1]).toBe('Charleston trip, 3 people');
    expect(screen.getByRole('header', { name: 'Groups' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Events' })).toBeTruthy();
    expectGrandparentSafe();
  });

  it('UX-G3 BETA-AUD-21 a relative allowed to post is never offered Everyone (the server would refuse it)', async () => {
    const { be, api } = shapedApi();
    const real = be.mySpaces.bind(be);
    jest.spyOn(be, 'mySpaces').mockImplementation((u) => real(u).map((s) => ({ ...s, can_post: true })));
    await renderApp(<ShareScreen />, { be, user: 'ruth', deps: { api } });
    expect(await screen.findByRole('checkbox', { name: "Mom's side, 4 people" })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Everyone, 6 people' })).toBeNull();
  });
});

describe('UX-G Groups screen invites (BETA-AUD-19)', () => {
  it('UX-G4 BETA-AUD-19 "Invite someone" only where the server takes it: a household or a group with nothing under it', async () => {
    const { be, api } = shapedApi();
    await renderApp(<GroupsScreen />, { be, user: 'chase', deps: { api } });
    expect(await screen.findByRole('button', { name: "Invite someone to Pawpaw and Granny's house" })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Invite someone to Everyone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Invite someone to Charleston trip' })).toBeNull();
    expect(screen.queryByRole('button', { name: "Invite someone to Mom's side" })).toBeNull();
    // and the parent is told where to go instead
    expect(screen.getAllByText('To invite someone, use their household below.').length).toBeGreaterThan(0);
  });

  it('RR-11 a family of plain groups (no households) is pointed to a group below, never to a household', async () => {
    await renderApp(<GroupsScreen />, { user: 'chase' });
    expect(await screen.findByRole('button', { name: "Invite someone to Grandparents – Dad's side" })).toBeTruthy();
    expect(screen.queryByText(/household/)).toBeNull();
    expect(screen.getByText('To invite someone, use one of the groups below.')).toBeTruthy();
  });

  it('UX-G5 BETA-AUD-19 the form says whose invite it is and what "all" means for that household', async () => {
    const { be, api } = shapedApi();
    await renderApp(<GroupsScreen />, { be, user: 'chase', deps: { api } });
    fireEvent.press(await screen.findByRole('button', { name: "Invite someone to Pawpaw and Granny's house" }));
    expect(screen.getByRole('header', { name: "Invite someone to Pawpaw and Granny's house" })).toBeTruthy();
    expect(screen.getByText("They'll see every photo Pawpaw and Granny's house can already see.")).toBeTruthy();
    expectGrandparentSafe();
  });
});

describe('UX-G reply setting (BETA-AUD-10)', () => {
  it('UX-G6 BETA-AUD-10 each choice says what it means for a grandparent, and a failed save says so', async () => {
    const be = FakeBackend.withFixture();
    const api = be.clientFor(null, { trackAppSession: true });
    await renderApp(<MeScreen />, { be, user: 'chase', deps: { api } });
    await screen.findByRole('radio', { name: 'The parents, plus their own household and events (safest)' });
    expect(screen.getByText("A grandparent's comment reaches you, the other parent, and their own household. Never the other side.")).toBeTruthy();
    expect(screen.getByText('Divorced grandparents on the same photo will read each other\'s comments.')).toBeTruthy();
    jest.spyOn(api, 'setReplyAudience').mockRejectedValue(new Error('offline'));
    fireEvent.press(screen.getByRole('radio', { name: 'Everyone the photo was shared with' }));
    expect(await screen.findByText("Didn't save. Check your internet and try again.")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'The parents, plus their own household and events (safest)' }).props.accessibilityState).toMatchObject({ checked: true }));
  });
});
