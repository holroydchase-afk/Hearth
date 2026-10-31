// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Sign-in and sign-up flows for every persona (Chase's ask, Oct 16).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
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
    expect(await screen.findByText('An invite code has 10 letters and numbers. Check the text or email from your family.')).toBeTruthy();
    expect(nav.goJoin).not.toHaveBeenCalled();
  });

  it('BETA-JOIN-8: signed in but not in a family yet, she can type the code right there', async () => {
    const be = FakeBackend.withFixture({ joIsMember: false });
    const { nav } = await renderApp(<AppGate />, { be, user: 'jo', waitReady: false });
    fireEvent.changeText(await screen.findByLabelText('Invite code'), 'GRANDMAJ23');
    fireEvent.press(screen.getByRole('button', { name: 'Open the invite' }));
    expect(nav.goJoin).toHaveBeenCalledWith('GRANDMAJ23');
  });

  it('HARD-4 pasting the whole invite link opens that invite, keeping the link token exactly', async () => {
    const { nav } = await renderApp(<AppGate />, { user: null, waitReady: false });
    fireEvent.press(await screen.findByRole('button', { name: 'I have an invite code' }));
    fireEvent.changeText(screen.getByLabelText('Invite code'), ' https://thefreighttrains-team-hearth.expo.app/join/aB3dE9xYz12QwErTy7 ');
    fireEvent.press(screen.getByRole('button', { name: 'Open the invite' }));
    expect(nav.goJoin).toHaveBeenCalledWith('aB3dE9xYz12QwErTy7');
  });

  it('BETA-JOIN-8: the invite card shows the code to read out, in two easy halves', async () => {
    await renderApp(<GroupsScreen />, { user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: "Invite someone to Grandparents – Dad's side" }));
    fireEvent.press(await screen.findByRole('radio', { name: 'Share all past photos' })); // BETA-AUD-19: the parent picks share history first
    fireEvent.press(await screen.findByRole('button', { name: 'Make the invite' }));
    expect(await screen.findByText(/^Or they can type this code in Hearth: [A-Z0-9]{5} [A-Z0-9]{5}$/)).toBeTruthy();
  });
});

describe('sign in: waiting for the code (BETA-JOIN-2)', () => {
  it('BETA-JOIN-2: says where to look, and asks her to wait a minute before a new code', async () => {
    await renderApp(<SignInScreen />, { user: null });
    await toCodeStep();
    expect(screen.getByText('It can take a minute. Not there? Look in your Junk or Spam folder.')).toBeTruthy();
    expect(screen.getByText(/You can ask for a new code in (60|59) seconds\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send a new code' }).props.accessibilityState).toMatchObject({ disabled: true });
    expectGrandparentSafe();
  });

  it('BETA-JOIN-2: after the minute, "Send a new code" works again', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    try {
      await renderApp(<SignInScreen />, { user: null });
      await toCodeStep();
      await act(async () => { jest.advanceTimersByTime(61_000); });
      expect(screen.queryByText(/You can ask for a new code in/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Send a new code' }).props.accessibilityState?.disabled ?? false).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('sign in: email typos (June types "yaho.com")', () => {
  it('HARD-5 going back to the email step does not skip the minute for the same address', async () => {
    await renderApp(<SignInScreen />, { user: null });
    await toCodeStep();
    fireEvent.press(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen.getByRole('button', { name: 'Send me a code' }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(/new code in \d+ seconds/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Your email'), 'ruth@example.com');
    expect(screen.getByRole('button', { name: 'Send me a code' }).props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('JOIN-2: suggests the likely email and never changes it on its own', async () => {
    await renderApp(<SignInScreen />, { user: null });
    fireEvent.changeText(await screen.findByLabelText('Your email'), 'june@yaho.com');
    expect(await screen.findByText('Did you mean june@yahoo.com?')).toBeTruthy();
    expect(screen.getByLabelText('Your email').props.value).toBe('june@yaho.com');
    fireEvent.press(screen.getByRole('button', { name: 'Use june@yahoo.com' }));
    expect(screen.getByLabelText('Your email').props.value).toBe('june@yahoo.com');
    expect(screen.queryByText(/Did you mean/)).toBeNull();
    expectGrandparentSafe();
  });

  it.each([
    ['earl@gmial.com', 'earl@gmail.com'], ['ruth@aol.co', 'ruth@aol.com'], ['kim@hotmal.com', 'kim@hotmail.com'],
    ['tammy@frontier.con', 'tammy@frontier.com'], ['jo@icloud.cm', 'jo@icloud.com'],
  ])('JOIN-2: %s -> %s', async (typed, fixed) => {
    await renderApp(<SignInScreen />, { user: null });
    fireEvent.changeText(await screen.findByLabelText('Your email'), typed);
    expect(await screen.findByText(`Did you mean ${fixed}?`)).toBeTruthy();
  });

  it('JOIN-2: a real address, or an uncommon one, gets no suggestion', async () => {
    await renderApp(<SignInScreen />, { user: null });
    for (const ok of ['june@yahoo.com', 'chase@holroyd.family', 'a@suddenlink.net']) {
      fireEvent.changeText(await screen.findByLabelText('Your email'), ok);
      expect(screen.queryByText(/Did you mean/)).toBeNull();
    }
  });
});

