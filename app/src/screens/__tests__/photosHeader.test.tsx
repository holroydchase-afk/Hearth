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
  it('R11 RV-U3 Messages and See events share a row; Check for new photos and Show by date share a row', async () => {
    await renderApp(<PhotosScreen />, { be: await withEvent(), user: 'jo' });
    const top = await screen.findByTestId('photos-actions-top');
    await within(top).findByRole('button', { name: 'See events' });
    expect(within(top).getByRole('button', { name: 'Messages' })).toBeTruthy();
    const feed = await screen.findByTestId('photos-actions-feed');
    expect(within(feed).getByRole('button', { name: 'Check for new photos' })).toBeTruthy();
    expect(within(feed).getByRole('button', { name: 'Show photos by the date they were taken' })).toBeTruthy();
    for (const row of [top, feed]) expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
  });

  it('R11 RV-U3 each half-width button keeps a 48 pt target and room for its words (min 150 pt, grows to fill)', async () => {
    await renderApp(<PhotosScreen />, { be: await withEvent(), user: 'jo' });
    const top = await screen.findByTestId('photos-actions-top');
    await within(top).findByRole('button', { name: 'See events' });
    for (const b of within(top).getAllByRole('button')) {
      expect(StyleSheet.flatten(b.props.style)).toMatchObject({ flexGrow: 1, flexBasis: 150 });
      expect(StyleSheet.flatten(b.props.style).minHeight).toBeGreaterThanOrEqual(48);
    }
    expectGrandparentSafe();
  });
});
