// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// DEMO-3 / DEMO-10 (RR-3, RR-10): the demo bar on every screen labels the sample data, switches
// between the parent's and Grandma Jo's view, starts over, and links back to the portfolio.
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { DemoBar, PORTFOLIO_URL } from '../DemoBar';
import { seedDemo } from '../seed';

const pic = async () => ({ display: new Uint8Array(10), thumb: new Uint8Array(5), width: 4, height: 3 });

async function setup() {
  const be = FakeBackend.withFixture({ joIsMember: true });
  await seedDemo(be, pic);
  const reload = jest.fn();
  const startOver = jest.fn();
  const open = jest.fn();
  render(<DemoBar be={be} reload={reload} startOver={startOver} open={open} />);
  return { be, reload, startOver, open };
}

describe('DEMO-3 / DEMO-10 demo bar', () => {
  it('DEMO-3 says it is a made-up family, kept in this browser, and who you are', async () => {
    await setup();
    expect(screen.getByText(/made-up family/i)).toBeTruthy();
    expect(screen.getByText(/You're Kai, a parent/)).toBeTruthy();
  });

  it('DEMO-10 one tap shows Grandma Jo\'s view, and one tap goes back', async () => {
    const { be, reload } = await setup();
    fireEvent.press(screen.getByRole('button', { name: "See the photos as Grandma Jo sees them" }));
    expect(be.state.appSession).toBe(FIXTURE.users.jo.id);
    expect(reload).toHaveBeenCalledTimes(1);
    screen.unmount();
    render(<DemoBar be={be} reload={reload} startOver={jest.fn()} open={jest.fn()} />);
    expect(screen.getByText(/You're Grandma Jo/)).toBeTruthy();
    // RR-17: two short lines at most, even with Grandma's Bigger text on.
    expect(screen.getByText(/You're Grandma Jo/).props.children.length).toBeLessThanOrEqual(75);
    fireEvent.press(screen.getByRole('button', { name: "Back to Kai's view, the parent" }));
    expect(be.state.appSession).toBe(FIXTURE.users.chase.id);
  });

  it('DEMO-3 Start over and the way back to chaseholroyd.com', async () => {
    const { startOver, open } = await setup();
    fireEvent.press(screen.getByRole('button', { name: 'Start over with the sample family' }));
    expect(startOver).toHaveBeenCalled();
    fireEvent.press(screen.getByRole('link', { name: "Back to Chase's portfolio" }));
    expect(open).toHaveBeenCalledWith(PORTFOLIO_URL);
    expect(PORTFOLIO_URL).toBe('https://chaseholroyd.com/family-photos.html');
  });
});
