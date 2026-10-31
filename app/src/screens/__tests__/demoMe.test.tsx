// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// DEMO-8 (RR-8): the public demo hides test tools and dead ends on the Me screen: notice timing,
// problem details ("Paste it to Claude"), and sign out / delete account (no way back in without a code).
import { screen } from '@testing-library/react-native';
import React from 'react';
import { FakeBackend } from '../../api/fake/FakeBackend';
import { renderApp } from '../../test/renderApp';
import { MeScreen } from '../MeScreen';

jest.mock('../../demo/flags', () => ({ DEMO_MODE: true }));

describe('DEMO-8 Me screen in the demo build', () => {
  it('DEMO-8 shows the real settings but no test tools, sign out or delete', async () => {
    await renderApp(<MeScreen />, { be: FakeBackend.withFixture(), user: 'chase' });
    expect(await screen.findByText('Bigger text')).toBeTruthy();
    expect(screen.queryByText(/For testing/)).toBeNull();
    expect(screen.queryByText('Problem details')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out of Hearth' })).toBeNull();
    expect(screen.queryByText(/Delete my account/i)).toBeNull();
  });
});
