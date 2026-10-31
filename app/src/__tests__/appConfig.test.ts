// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// EXPO-3: milestone 1 runs in Expo Go (Chase, Oct 17), so the app reaches Chase's iPhone as an EAS Update
// opened in Expo Go, with no laptop dev server. Expo Go only loads an update whose runtime version is its
// SDK ("exposdk:57.0.0"), so the policy must be sdkVersion until the first real build (milestone 2).
import appJson from '../../app.json';
import pkg from '../../package.json';

describe('EXPO-3 app reaches Expo Go as an EAS Update', () => {
  const expo = appJson.expo as typeof appJson.expo & { runtimeVersion?: unknown; updates?: { url?: string } };

  it('EXPO-3 updates URL points at this Expo project', () => {
    expect(expo.updates?.url).toBe(`https://u.expo.dev/${expo.extra.eas.projectId}`);
  });

  it('EXPO-3 runtime version follows the SDK, so Expo Go can open it', () => {
    expect(expo.runtimeVersion).toEqual({ policy: 'sdkVersion' });
  });

  it('EXPO-3 expo-updates is installed (eas update requires it)', () => {
    expect((pkg.dependencies as Record<string, string>)['expo-updates']).toBeDefined();
  });
});
