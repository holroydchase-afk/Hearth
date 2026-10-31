// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// R11 (RV-U3, design note docs/product/decisions/2026-10-21-photos-header.md): fewer stacked buttons before the
// first photo. The four header buttons sit two to a row; with Bigger text a row wraps instead of squeezing.
import { screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';

async function withEvent() {
  const be = FakeBackend.withFixture();
  const chase = be.clientFor(FIXTURE.users.chase.id);
  const ev = await chase.createLevel(FIXTURE.space.id, 'event', 'Beach week');
  await chase.placePerson(ev, FIXTURE.users.jo.id, 'all');
  await seedPost(be, { caption: 'Sandcastle', circles: [ev] });
  return be;
}

describe('R11 RV-U3 Photos header', () => {
  it('UI-26 one header row: Messages and By date (sort icon) side by side, no "Check for new photos" button', async () => {
    await renderApp(<PhotosScreen />, { be: await withEvent(), user: 'jo' });
    const row = await screen.findByTestId('photos-actions');
    await within(row).findByRole('button', { name: 'See events' });
    expect(within(row).getByRole('button', { name: 'Messages' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Show photos by the date they were taken' })).toBeTruthy();
    expect(within(row).getByText('By date')).toBeTruthy();
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    // Photos refresh on their own (open, back in front) and with pull-to-refresh; no button for it.
    expect(screen.queryByRole('button', { name: 'Check for new photos' })).toBeNull();
    expect(screen.queryByTestId('photos-actions-feed')).toBeNull();
  });

  it('R11 RV-U3 each half-width button keeps a 48 pt target and room for its words (min 150 pt, grows to fill)', async () => {
    await renderApp(<PhotosScreen />, { be: await withEvent(), user: 'jo' });
    const row = await screen.findByTestId('photos-actions');
    await within(row).findByRole('button', { name: 'See events' });
    for (const b of within(row).getAllByRole('button')) {
      expect(StyleSheet.flatten(b.props.style)).toMatchObject({ flexGrow: 1, flexBasis: 150 });
      expect(StyleSheet.flatten(b.props.style).minHeight).toBeGreaterThanOrEqual(48);
    }
    expectGrandparentSafe();
  });
});
