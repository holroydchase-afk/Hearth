// BETA-NOTIFY-7: a poster sets the name the family knows them by, once.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';

describe('your name (BETA-NOTIFY-7)', () => {
  it('BETA-NOTIFY-7: a poster with a placeholder name is asked once, and it saves', async () => {
    const be = FakeBackend.withFixture();
    be.state.users[FIXTURE.users.chase.id]!.name = 'holroydchase';
    be.state.users[FIXTURE.users.chase.id]!.nameSet = false;
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    expect(await screen.findByText('What should your family call you?')).toBeTruthy();
    expectGrandparentSafe();
    fireEvent.changeText(screen.getByLabelText('Your name'), 'Chase');
    fireEvent.press(screen.getByRole('button', { name: 'Save my name' }));
    expect(await screen.findByText('Saved. Your family will see "Chase".')).toBeTruthy();
    await waitFor(() => expect(be.state.users[FIXTURE.users.chase.id]!.name).toBe('Chase'));
  });

  it('BETA-NOTIFY-7: a name with an email address is refused in plain words', async () => {
    const be = FakeBackend.withFixture();
    be.state.users[FIXTURE.users.chase.id]!.nameSet = false;
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    fireEvent.changeText(await screen.findByLabelText('Your name'), 'chase@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Save my name' }));
    expect(await screen.findByText('Use the name your family calls you, like "Chase" or "Grandma June".')).toBeTruthy();
  });

  it('BETA-NOTIFY-7: nobody whose name is set, and no viewer, is asked', async () => {
    await renderApp(<PhotosScreen />, { user: 'chase' });
    await screen.findAllByText(/./);
    expect(screen.queryByText('What should your family call you?')).toBeNull();
    const be = FakeBackend.withFixture();
    be.state.users[FIXTURE.users.jo.id]!.nameSet = false;
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    await screen.findAllByText(/./);
    expect(screen.queryByText('What should your family call you?')).toBeNull();
  });
});
