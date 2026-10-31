// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// HELP-R6 (TRACKER R17): the family's owner turns the photo helpers off and on from Me. Nobody else sees the
// switches. Written first: red until the card exists.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { MeScreen } from '../MeScreen';

const REPEATS = 'Set aside repeats';
const SCREENS = 'Set aside screenshots and blurry photos';

describe('HELP-R6 photo helpers switch for the owner', () => {
  it('HELP-R6 the owner sees both helpers on, in plain words', async () => {
    await renderApp(<MeScreen />, { user: 'chase' });
    expect(await screen.findByText('Photo helpers')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('switch', { name: REPEATS }).props.accessibilityState.checked).toBe(true));
    expect(screen.getByRole('switch', { name: SCREENS }).props.accessibilityState.checked).toBe(true);
    expectGrandparentSafe();
  });

  it('HELP-R6 turning one off saves it for the family and leaves the other on', async () => {
    const be = FakeBackend.withFixture();
    await renderApp(<MeScreen />, { be, user: 'chase' });
    const sw = await screen.findByRole('switch', { name: SCREENS });
    await waitFor(() => expect(sw.props.accessibilityState.checked).toBe(true));
    fireEvent.press(sw);
    await waitFor(() => expect(screen.getByRole('switch', { name: SCREENS }).props.accessibilityState.checked).toBe(false));
    expect(be.state.spaceFeatures?.[`${FIXTURE.space.id}:photo_helpers_screens_blur`]).toBe(false);
    expect(be.myFeatures(FIXTURE.users.chase.id, FIXTURE.space.id)).toEqual(['photo_helpers_duplicates']);
    expect(screen.getByRole('switch', { name: REPEATS }).props.accessibilityState.checked).toBe(true);
  });

  it('HELP-R6 a failed save says so and the switch stays as it was', async () => {
    const be = FakeBackend.withFixture();
    jest.spyOn(be, 'setFamilyFeature').mockImplementation(() => { throw new Error('offline'); });
    await renderApp(<MeScreen />, { be, user: 'chase' });
    const sw = await screen.findByRole('switch', { name: REPEATS });
    await waitFor(() => expect(sw.props.accessibilityState.checked).toBe(true));
    fireEvent.press(sw);
    expect(await screen.findByText("Didn't save. Check your signal, then tap the switch again.")).toBeTruthy();
    expect(screen.getByRole('switch', { name: REPEATS }).props.accessibilityState.checked).toBe(true);
  });

  it('HELP-R6 the other parent does not see the switches', async () => {
    await renderApp(<MeScreen />, { user: 'alex' });
    await screen.findByText('Me');
    expect(screen.queryByText('Photo helpers')).toBeNull();
  });

  it('HELP-R6 the fake refuses anyone but the owner (42501)', () => {
    const be = FakeBackend.withFixture();
    expect(() => be.setFamilyFeature(FIXTURE.users.alex.id, FIXTURE.space.id, 'photo_helpers_duplicates', false)).toThrow(
      expect.objectContaining({ code: '42501' }));
  });
});
