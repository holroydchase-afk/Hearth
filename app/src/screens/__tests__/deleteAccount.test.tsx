// BETA-JOIN-7: in-app account deletion (Beta App Review expects it).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { HelpScreen } from '../HelpScreen';
import { MeScreen } from '../MeScreen';

describe('Delete my account (BETA-JOIN-7)', () => {
  it('BETA-JOIN-7: a viewer deletes after a plain confirm, is signed out, and is out of the family', async () => {
    const be = FakeBackend.withFixture();
    const { nav } = await renderApp(<HelpScreen />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Take me off Hearth' }));
    expect(screen.getByText("This takes you off Hearth for good. Your comments and hearts are removed. This can't be undone.")).toBeTruthy();
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: 'Yes, take me off Hearth' }));
    await waitFor(() => expect(be.state.members.some((m) => m.user === FIXTURE.users.jo.id)).toBe(false));
    await waitFor(() => expect(be.state.appSession).toBeNull());
    expect(nav).toBeTruthy();
  });

  it('BETA-JOIN-7: "No, stay on Hearth" changes nothing', async () => {
    const be = FakeBackend.withFixture();
    await renderApp(<HelpScreen />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Take me off Hearth' }));
    fireEvent.press(screen.getByRole('button', { name: 'No, stay on Hearth' }));
    expect(be.state.members.some((m) => m.user === FIXTURE.users.jo.id)).toBe(true);
    expect(screen.getByRole('button', { name: 'Take me off Hearth' })).toBeTruthy();
  });

  it('BETA-JOIN-7: the owner of the family space is not offered it (that decision is Chase\'s)', async () => {
    await renderApp(<MeScreen />, { user: 'chase' });
    await screen.findByText(/Signed in as/);
    expect(screen.queryByRole('button', { name: 'Take me off Hearth' })).toBeNull();
  });
});
