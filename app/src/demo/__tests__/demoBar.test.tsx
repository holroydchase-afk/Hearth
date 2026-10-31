// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// DEMO-BAR (intake #82, pm-tools docs/DEMO-BANNER.md): the studio demo bar. A slim Demo bar with the
// way back, a Demo badge and Details; Details opens a drawer with the standard copy, Grandma Jo's view
// (DEMO-10), Reset demo (asks first) and the way back to the portfolio.
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { paletteFor, type OS } from '../../ui/theme';
import { DemoBar, PORTFOLIO_URL } from '../DemoBar';
import { seedDemo } from '../seed';

const light = paletteFor(Platform.OS as OS, false);
const pic = async () => ({ display: new Uint8Array(10), thumb: new Uint8Array(5), width: 4, height: 3 });
const COPY = 'This is the real Hearth, running on made-up sample data. Anything you change is saved only in this browser and is never sent anywhere. Reset demo puts the sample data back.';

async function setup(restored = false) {
  const be = FakeBackend.withFixture({ joIsMember: true });
  await seedDemo(be, pic);
  const reload = jest.fn();
  const startOver = jest.fn();
  const open = jest.fn();
  render(<DemoBar be={be} reload={reload} startOver={startOver} open={open} restored={restored} />);
  return { be, reload, startOver, open };
}
const toggle = (expanded: boolean) => screen.getByRole('button', { name: 'Demo details', expanded });

describe('DEMO-BAR studio demo bar', () => {
  it('DEMO-BAR collapsed on load: back link, Demo badge, Sample data, Details; no drawer', async () => {
    const { open } = await setup();
    expect(toggle(false)).toBeTruthy();
    expect(screen.getByText('Demo')).toBeTruthy();
    expect(screen.getByText(/^Sample data/)).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.queryByText(COPY)).toBeNull();
    fireEvent.press(screen.getByRole('link', { name: 'Back to the portfolio' }));
    expect(open).toHaveBeenCalledWith(PORTFOLIO_URL);
    expect(PORTFOLIO_URL).toBe('https://chaseholroyd.com/family-photos.html');
  });

  it('DEMO-BAR is a named region, at most 48 px tall, on the card surface', async () => {
    await setup();
    const bar = screen.getByTestId('demo-bar');
    expect(bar.props.role ?? bar.props.accessibilityRole).toMatch(/region|summary/);
    expect(bar.props['aria-label'] ?? bar.props.accessibilityLabel).toBe('Demo');
    const row = StyleSheet.flatten(screen.getByTestId('demo-bar-row').props.style);
    expect(row.minHeight).toBeGreaterThanOrEqual(44);
    expect(row.maxHeight).toBeLessThanOrEqual(48);
    expect(StyleSheet.flatten(bar.props.style).backgroundColor).toBe(light.surface);
  });

  it('DEMO-BAR the note follows the bar\'s own width, not the window (the laptop frame is phone-wide)', async () => {
    await setup();
    fireEvent(screen.getByTestId('demo-bar'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 430, height: 48 } } });
    expect(screen.getByText('Sample data')).toBeTruthy();
    fireEvent(screen.getByTestId('demo-bar'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 48 } } });
    expect(screen.queryByText(/^Sample data/)).toBeNull();
  });

  it('DEMO-BAR Reset demo is a pill like the drawer\'s other button', async () => {
    await setup();
    fireEvent.press(toggle(false));
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Reset demo' }).props.style).borderRadius).toBeGreaterThanOrEqual(24);
  });

  it('DEMO-BAR the badge is outlined in the body text color, never the accent', async () => {
    await setup();
    const badge = StyleSheet.flatten(screen.getByTestId('demo-badge').props.style);
    expect(badge.borderColor).toBe(light.ink);
    expect(badge.backgroundColor ?? 'transparent').toBe('transparent');
    expect([badge.borderColor, badge.backgroundColor]).not.toContain(light.accent);
  });

  it('DEMO-BAR Details opens the drawer with the standard copy, and closes it again', async () => {
    await setup();
    fireEvent.press(toggle(false));
    expect(toggle(true)).toBeTruthy();
    expect(screen.getByText(COPY)).toBeTruthy();
    fireEvent.press(toggle(true));
    expect(screen.queryByText(COPY)).toBeNull();
  });

  it('DEMO-BAR Reset demo asks first; Keep changes nothing, Reset starts over', async () => {
    const { startOver } = await setup();
    fireEvent.press(toggle(false));
    fireEvent.press(screen.getByRole('button', { name: 'Reset demo' }));
    expect(screen.getByText('Put the sample data back? Your changes will be lost.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
    expect(startOver).not.toHaveBeenCalled();
    expect(screen.queryByText(/Put the sample data back/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Reset demo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Reset' }));
    expect(startOver).toHaveBeenCalledTimes(1);
  });

  it('DEMO-BAR after a reset the drawer opens once and says Sample data restored.', async () => {
    await setup(true);
    expect(toggle(true)).toBeTruthy();
    expect(screen.getByText('Sample data restored.')).toBeTruthy();
  });

  it('DEMO-BAR the drawer leads back to the portfolio in full', async () => {
    const { open } = await setup();
    fireEvent.press(toggle(false));
    fireEvent.press(screen.getByRole('link', { name: 'Back to the Hearth case study' }));
    expect(open).toHaveBeenCalledWith(PORTFOLIO_URL);
  });

  it("DEMO-10 the drawer switches to Grandma Jo's view and back in one tap", async () => {
    const { be, reload } = await setup();
    fireEvent.press(toggle(false));
    expect(screen.getByText(/You're Kai, a parent/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'See the photos as Grandma Jo sees them' }));
    expect(be.state.appSession).toBe(FIXTURE.users.jo.id);
    expect(reload).toHaveBeenCalledTimes(1);
    screen.unmount();
    render(<DemoBar be={be} reload={reload} startOver={jest.fn()} open={jest.fn()} />);
    fireEvent.press(toggle(false));
    expect(screen.getByText(/You're Grandma Jo/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: "Back to Kai's view, the parent" }));
    expect(be.state.appSession).toBe(FIXTURE.users.chase.id);
  });
});
