// Sign-in and sign-up flows for every persona (Chase's ask, Oct 16).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderApp } from '../../test/renderApp';
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
