// UI-1..2 (release M1.1 phase 3, docs/reviews/2026-10-28-ui-8.md): the demo bar takes one short line plus
// one row of short chips, and the laptop frame centres the phone with a clear next step for a recruiter.
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { FakeBackend } from '../../api/fake/FakeBackend';
import { DemoBar, PORTFOLIO_URL } from '../DemoBar';
import { DemoFrame } from '../DemoFrame';
import { seedDemo, setDemoViewer } from '../seed';

const pic = async () => ({ display: new Uint8Array(10), thumb: new Uint8Array(5), width: 4, height: 3 });
const words = (name: string) => {
  const t = screen.getByRole('button', { name }).findAllByType(Text)[0]!.props.children;
  return String(t);
};

describe('UI-1 compact demo bar', () => {
  it.each(['parent', 'grandma'] as const)('UI-1 %s: one short line and chips short enough for one row at 390 px', async (who) => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    await seedDemo(be, pic);
    setDemoViewer(be, who);
    render(<DemoBar be={be} reload={jest.fn()} startOver={jest.fn()} open={jest.fn()} />);
    const line = screen.getByText(who === 'parent' ? /You're Sam, a parent/ : /You're Grandma Jo/).props.children as string;
    expect(line.length).toBeLessThanOrEqual(38); // one line at 390 px
    const swap = who === 'parent' ? 'See the photos as Grandma Jo sees them' : "Back to Sam's view, the parent";
    const chips = [words(swap), words('Start over with the sample family'), screen.getByRole('link', { name: "Back to Chase's portfolio" }).findAllByType(Text)[0]!.props.children];
    expect(chips.join('').length).toBeLessThanOrEqual(30);
    expect(StyleSheet.flatten(screen.getByTestId('demo-bar').props.style).paddingTop).toBeLessThanOrEqual(8);
    // all three chips look alike: Portfolio is a pill too, not bare link text
    expect(StyleSheet.flatten(screen.getByRole('link', { name: "Back to Chase's portfolio" }).props.style).backgroundColor).not.toBe('transparent');
  });
});

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
