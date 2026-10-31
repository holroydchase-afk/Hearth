// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// UI-3..4 (release M1.1 phase 3, docs/reviews/2026-10-28-ui-8.md): one solid button per screen, and the
// demo's Me screen names the made-up person instead of a placeholder email.
import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { FakeBackend } from '../../api/fake/FakeBackend';
import { renderApp } from '../../test/renderApp';
import { MeScreen } from '../MeScreen';
import { PhotosScreen } from '../PhotosScreen';

let mockDemo = false;
jest.mock('../../demo/flags', () => ({ get DEMO_MODE() { return mockDemo; } }));

describe('UI-3 Messages list', () => {
  it('UI-3 each chat\'s Open button is a gray button, not a row of solid blue ones', async () => {
    await renderApp(<PhotosScreen />, { be: FakeBackend.withFixture({ joIsMember: true }), user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: 'Messages' }));
    const opens = await screen.findAllByRole('button', { name: /^Open the chat/ });
    expect(opens.length).toBeGreaterThan(1);
    for (const b of opens) expect(StyleSheet.flatten(b.props.style).backgroundColor).not.toBe('#0040DD');
  });
});

describe('UI-4 Me in the demo', () => {
  afterEach(() => { mockDemo = false; });
  it('UI-4 the demo says who you are by name, never an example.com address', async () => {
    mockDemo = true;
    await renderApp(<MeScreen />, { be: FakeBackend.withFixture(), user: 'chase' });
    expect(await screen.findByText(/You're .+ in the made-up sample family/)).toBeTruthy();
    expect(screen.queryByText(/@/)).toBeNull();
  });
  it('UI-4 the real app still says which email you signed in with', async () => {
    await renderApp(<MeScreen />, { be: FakeBackend.withFixture(), user: 'chase' });
    expect(await screen.findByText(/^Signed in as .+@/)).toBeTruthy();
  });
});
