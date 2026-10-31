// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// UI-2 (release M1.1 phase 3, docs/reviews/2026-10-28-ui-8.md): the laptop frame centres the phone with a
// clear next step for a recruiter. UI-1's chip bar gave way to the studio demo bar (DEMO-BAR, demoBar.test.tsx).
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { PORTFOLIO_URL } from '../DemoBar';
import { DemoFrame } from '../DemoFrame';

describe('UI-2 laptop frame', () => {
  it('UI-2 centres the phone, gives it a shadow, and leads to the case study with three proof points', () => {
    const open = jest.fn();
    render(<DemoFrame width={1280} open={open}><Text>the app</Text></DemoFrame>);
    const row = StyleSheet.flatten(screen.getByTestId('demo-frame').props.style);
    expect(row.alignItems).toBe('center');
    const col = StyleSheet.flatten(screen.getByTestId('demo-app-column').props.style);
    expect(col.maxHeight).toBeLessThanOrEqual(880);
    expect(col.boxShadow ?? col.shadowOpacity).toBeTruthy();
    for (const p of [/Private by name/, /Data stays in the US/, /No ads, no AI training/]) expect(screen.getByText(p)).toBeTruthy();
    fireEvent.press(screen.getByRole('link', { name: 'Read the case study on chaseholroyd.com' }));
    expect(open).toHaveBeenCalledWith(PORTFOLIO_URL);
    expect(screen.getByText(/stays in this browser/)).toBeTruthy();
  });
});
