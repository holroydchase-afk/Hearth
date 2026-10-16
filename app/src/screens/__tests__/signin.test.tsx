// Sign-in and sign-up flows for every persona (Chase's ask, Oct 16).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FakeBackend } from '../../api/fake/FakeBackend';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { AppGate } from '../AppGate';
import { GroupsScreen } from '../GroupsScreen';
import { SignInScreen } from '../SignInScreen';

async function toCodeStep(email = 'jo@example.com') {
  fireEvent.changeText(await screen.findByLabelText('Your email'), email);
  fireEvent.press(screen.getByRole('button', { name: 'Send me a code' }));
  return screen.findByLabelText('6-number code');
}

describe('sign in: the 6-number code', () => {
  it('JOIN-2: a pasted or autofilled code with spaces or dashes still fits ("123 456" -> 123456)', async () => {
    const { nav } = await renderApp(<SignInScreen />, { user: null });
    const box = await toCodeStep();
    fireEvent.changeText(box, '123-456');
    expect(screen.getByLabelText('6-number code').props.value).toBe('123456');
    fireEvent.changeText(box, '123 456');
    expect(screen.getByLabelText('6-number code').props.value).toBe('123456');
    expect(screen.getByLabelText('6-number code').props.maxLength ?? 99).toBeGreaterThan(6);
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(nav.goPhotos).toHaveBeenCalled());
  });
});

describe('BETA-JOIN-8: typing an invite code (links can open in a browser, or Tammy reads it out)', () => {
  it('BETA-JOIN-8: signed out, "I have an invite code" takes any case, spaces or dashes', async () => {
    const { nav } = await renderApp(<AppGate />, { user: null, waitReady: false });
    fireEvent.press(await screen.findByRole('button', { name: 'I have an invite code' }));
    expectGrandparentSafe();
    fireEvent.changeText(screen.getByLabelText('Invite code'), ' grand-maj 23 ');
    fireEvent.press(screen.getByRole('button', { name: 'Open the invite' }));
    expect(nav.goJoin).toHaveBeenCalledWith('GRANDMAJ23');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('BETA-JOIN-8: a code that is clearly too short says so in plain words, and goes nowhere', async () => {
    const { nav } = await renderApp(<AppGate />, { user: null, waitReady: false });
    fireEvent.press(await screen.findByRole('button', { name: 'I have an invite code' }));
    fireEvent.changeText(screen.getByLabelText('Invite code'), 'abc');
    fireEvent.press(screen.getByRole('button', { name: 'Open the invite' }));
    expect(await screen.findByText('An invite code has 10 letters and numbers. Check the text from your family.')).toBeTruthy();
    expect(nav.goJoin).not.toHaveBeenCalled();
  });

  it('BETA-JOIN-8: signed in but not in a family yet, she can type the code right there', async () => {
    const be = FakeBackend.withFixture({ joIsMember: false });
    const { nav } = await renderApp(<AppGate />, { be, user: 'jo', waitReady: false });
    fireEvent.changeText(await screen.findByLabelText('Invite code'), 'GRANDMAJ23');
    fireEvent.press(screen.getByRole('button', { name: 'Open the invite' }));
    expect(nav.goJoin).toHaveBeenCalledWith('GRANDMAJ23');
  });

  it('BETA-JOIN-8: the invite card shows the code to read out, in two easy halves', async () => {
    await renderApp(<GroupsScreen />, { user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: "Invite someone to Grandparents – Dad's side" }));
    fireEvent.press(await screen.findByRole('button', { name: 'Make the invite' }));
    expect(await screen.findByText(/^Or they can type this code in Hearth: [A-Z0-9]{5} [A-Z0-9]{5}$/)).toBeTruthy();
  });
});

