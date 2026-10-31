// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// DBG-3 / DBG-4: "Show details" under a failed upload and "Problem details" in Help and Me, each
// with "Copy for Claude" (one plain-text block). Only in Chase's debug builds, never for relatives.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { Text } from 'react-native';
import { ApiError, type ApiErrorCode } from '../../api/HearthApi';
import { FakeBackend } from '../../api/fake/FakeBackend';
import { clearProblems, problems, recordProblem } from '../../errors/problemLog';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { HelpScreen } from '../HelpScreen';
import { MeScreen } from '../MeScreen';
import { ShareScreen } from '../ShareScreen';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const DAD = "Grandparents – Dad's side";
const CAPTION = 'First snow!';
const prev = process.env.EXPO_PUBLIC_HEARTH_DEBUG;
beforeEach(() => { process.env.EXPO_PUBLIC_HEARTH_DEBUG = '1'; clearProblems(); jest.mocked(Clipboard.setStringAsync).mockClear(); });
afterAll(() => { process.env.EXPO_PUBLIC_HEARTH_DEBUG = prev; });

async function failedShare(code: string) {
  const be = FakeBackend.withFixture();
  await renderApp(<ShareScreen />, {
    be, user: 'chase',
    deps: { prepare: jest.fn(async () => { throw new ApiError(code as ApiErrorCode, `file:///pick/1.jpg "${CAPTION}"`); }) },
  });
  fireEvent.press(await screen.findByRole('button', { name: 'Pick photos from your phone' }));
  await screen.findByText('1 photo picked');
  fireEvent.changeText(screen.getByLabelText("What's happening?"), CAPTION);
  fireEvent.press(screen.getByRole('checkbox', { name: `${DAD}, 3 people` }));
  fireEvent.press(screen.getByRole('button', { name: 'Post' }));
  await screen.findByText(/Didn't send/);
}

describe('DBG-3 failed upload: Show details', () => {
  it('DBG-3 a failed item has "Show details" under the reason line; it shows the entry and copies it for Claude', async () => {
    await failedShare('EXIF');
    const show = screen.getByRole('button', { name: 'Show problem details' });
    expect(screen.queryByRole('button', { name: 'Copy problem details for Claude' })).toBeNull();
    fireEvent.press(show);
    expect(screen.getByText(/where: upload: prepare/)).toBeTruthy();
    expect(screen.getByText(/code: EXIF/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Copy problem details for Claude' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1));
    const copied = jest.mocked(Clipboard.setStringAsync).mock.calls[0]![0];
    expect(copied.split('\n')[0]).toBe('Hearth problem details');
    expect(copied).toContain('code: EXIF');
    expect(copied).not.toContain(CAPTION);
    expect(copied).not.toContain('file:');
    expect(await screen.findByText('Copied. Paste it to Claude.')).toBeTruthy();
    expectGrandparentSafe();
  });

  it('DBG-4 with the debug flag off a failed item has no "Show details"', async () => {
    delete process.env.EXPO_PUBLIC_HEARTH_DEBUG;
    await failedShare('EXIF');
    expect(screen.getByRole('button', { name: 'Try sending again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show problem details' })).toBeNull();
    expect(screen.queryByText(/Hearth problem details|Copy for Claude/)).toBeNull();
  });
});

describe('DBG-3 Help and Me: Problem details', () => {
  it.each([
    ['Help', <HelpScreen key="h" />, 'jo'],
    ['Me', <MeScreen key="m" />, 'chase'],
  ] as const)('DBG-3 %s lists problems newest first and copies them in one block', async (_name, ui, user) => {
    recordProblem(new ApiError('42501', 'not allowed'), 'groups: rename');
    recordProblem(new ApiError('EXIF', 'exif'), 'upload: prepare');
    await renderApp(ui, { user });
    expect(await screen.findByText('Problem details')).toBeTruthy();
    const wheres = screen.UNSAFE_queryAllByType(Text).map((t) => String(t.props.children)).filter((s) => s.includes('where: '));
    expect(wheres).toHaveLength(2);
    expect(wheres[0]).toContain('where: upload: prepare');
    expect(wheres[1]).toContain('where: groups: rename');
    fireEvent.press(screen.getByRole('button', { name: 'Copy problem details for Claude' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1));
    const copied = jest.mocked(Clipboard.setStringAsync).mock.calls[0]![0];
    expect(copied.startsWith('Hearth problem details\n')).toBe(true);
    expect(copied.indexOf('upload: prepare')).toBeLessThan(copied.indexOf('groups: rename'));
    expectGrandparentSafe();
  });

  it('DBG-3 with no problems it says so in plain words', async () => {
    await renderApp(<MeScreen />, { user: 'chase' });
    expect(await screen.findByText('No problems so far.')).toBeTruthy();
  });

  it.each([
    ['Help', <HelpScreen key="h" />, 'jo'],
    ['Me', <MeScreen key="m" />, 'chase'],
  ] as const)('DBG-4 with the debug flag off %s has no Problem details', async (_name, ui, user) => {
    delete process.env.EXPO_PUBLIC_HEARTH_DEBUG;
    recordProblem(new ApiError('42501', 'not allowed'), 'groups: rename');
    await renderApp(ui, { user });
    await screen.findByRole('switch', { name: 'Bigger text' });
    expect(screen.queryByText('Problem details')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy problem details for Claude' })).toBeNull();
  });
});

describe('DBG-1 ErrorBoundary call site', () => {
  it('DBG-1 a screen crash is recorded with its screen and no message text that is private', () => {
    const Boom = () => { throw new TypeError(`Cannot read caption "${CAPTION}" at https://x.example/a?token=abc`); };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ErrorBoundary screen="photos"><Boom /></ErrorBoundary>);
    spy.mockRestore(); warn.mockRestore();
    const e = problems()[0]!;
    expect(e).toMatchObject({ where: 'photos', code: 'TypeError' });
    expect(JSON.stringify(e)).not.toMatch(/First snow|https:|token=/);
  });
});
