// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// BETA-OPS-1: our own error reports, with no user content and no third-party SDK.
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import pkg from '../../../package.json';
import { ErrorBoundary } from '../ErrorBoundary';
import { errorReport } from '../../errors/report';

function Bomb(): never {
  throw new Error('Caption "Mia at the park" failed at https://b2.example/k?sig=abc for jo@example.com');
}

describe('error reports (BETA-OPS-1)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('BETA-OPS-1: a screen crash sends exactly 1 report with version, OS, screen and error type only', () => {
    const report = jest.fn(async () => {});
    render(<ErrorBoundary onReport={report} screen="photos"><Bomb /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong.')).toBeTruthy();
    expect(report).toHaveBeenCalledTimes(1);
    const sent = (report.mock.calls[0] as unknown[])[0];
    expect(sent).toEqual({ appVersion: pkg.version, os: expect.stringMatching(/^(ios|android|web)( [0-9.]+)?$/), screen: 'photos', kind: 'Error' });
    expect(JSON.stringify(sent)).not.toMatch(/Mia|http|@|sig/);
  });

  it('BETA-OPS-1: a failing report never causes a second error', () => {
    const report = jest.fn(async () => { throw new Error('offline'); });
    render(<ErrorBoundary onReport={report}><Bomb /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong.')).toBeTruthy();
  });

  it('BETA-OPS-1: API errors report their code, and odd error names are made safe', () => {
    const e = Object.assign(new Error('x'), { name: 'ApiError', code: 'P0002' });
    expect(errorReport(e, 'viewer/[postId]')).toMatchObject({ kind: 'ApiError', code: 'P0002', screen: 'viewer/[postId]' });
    const weird = Object.assign(new Error('x'), { name: 'Grandma Jo <jo@x.com>' });
    expect(errorReport(weird, 'photos').kind).toBe('Error');
    expect(errorReport('a string', 'Bad Screen!').screen).toBe('unknown');
  });

  it('BETA-OPS-1: the app ships no third-party analytics or crash SDK', () => {
    const deps = Object.keys({ ...pkg.dependencies, ...(pkg as { devDependencies?: object }).devDependencies });
    const banned = /sentry|bugsnag|crashlytics|firebase|analytics|amplitude|mixpanel|segment|posthog|datadog|newrelic|appcenter|instabug|logrocket/i;
    expect(deps.filter((d) => banned.test(d))).toEqual([]);
  });
});
