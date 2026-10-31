// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// DEMO-6 (RR-6): on a laptop the demo shows the app in a phone-width column beside a short panel that
// tells a hiring manager what Hearth is and what to try; on a phone it's just the app.
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { APP_COLUMN, DemoFrame } from '../DemoFrame';

describe('DEMO-6 laptop frame', () => {
  it('DEMO-6 at 1280 px: a story panel and the app in a 430 px column', () => {
    render(<DemoFrame width={1280}><Text>the app</Text></DemoFrame>);
    expect(screen.getByRole('header', { name: 'A private photo app for split families' })).toBeTruthy();
    expect(screen.getByText(/See it as Grandma Jo/)).toBeTruthy();
    expect(screen.getByText(/Built test-first by Chase Holroyd/)).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('demo-app-column').props.style).width).toBe(APP_COLUMN);
    expect(APP_COLUMN).toBe(430);
    expect(screen.getByText('the app')).toBeTruthy();
  });

  it('DEMO-6 at 390 px: only the app, full width', () => {
    render(<DemoFrame width={390}><Text>the app</Text></DemoFrame>);
    expect(screen.queryByText(/A private photo app/)).toBeNull();
    expect(screen.queryByTestId('demo-app-column')).toBeNull();
    expect(screen.getByText('the app')).toBeTruthy();
  });
});
