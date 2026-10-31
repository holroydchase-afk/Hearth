// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { ErrorBoundary } from '../ErrorBoundary';

let boom = true;
function Bomb() {
  if (boom) throw new Error('relation "posts" does not exist');
  return null;
}

it('shows a plain sentence, never the error, and can try again', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  render(<ErrorBoundary helper="Chase"><Bomb /></ErrorBoundary>);
  expect(screen.getByText('Something went wrong.')).toBeTruthy();
  expect(screen.getByText('Close Hearth and open it again. If it keeps happening, call Chase.')).toBeTruthy();
  expect(screen.queryByText(/relation/)).toBeNull();
  boom = false;
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.queryByText('Something went wrong.')).toBeNull();
});
