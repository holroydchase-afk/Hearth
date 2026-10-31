// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// DS-1..DS-9 (docs/product/DESIGN-SYSTEM.md): each phone's own design system, plus Hearth's overrides.
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import pkg from '../../../package.json';
import { NATIVE_TAB_OPTIONS, TAB_ICONS, tabsFor } from '../../screens/TabBar';
import { expectGrandparentSafe } from '../../test/renderApp';
import { Button } from '../kit';
import { contrast, paletteFor, systemFontFamily, typeScale } from '../theme';

describe('DS native design system', () => {
  it('DS-FONT: the phone’s own font on iPhone and Android, the system stack on the web, no bundled brand fonts', () => {
    expect(systemFontFamily('ios')).toBeUndefined();
    expect(systemFontFamily('android')).toBeUndefined();
    expect(systemFontFamily('web')).toMatch(/^system-ui, -apple-system/);
    expect(Object.keys(pkg.dependencies).filter((d) => d.startsWith('@expo-google-fonts/'))).toEqual([]);
  });

  it('DS-2: text follows the platform ramp (body 17, title 22, large 28) and never goes under 17', () => {
    expect(typeScale(false)).toMatchObject({ base: 17, title: 22, display: 28 });
    const big = typeScale(true);
    expect(big.base).toBeGreaterThanOrEqual(21);
    expect(big.title).toBeGreaterThan(big.base);
  });

  it('DS-COLOR: Apple system colors on iPhone, Material 3 on Android', () => {
    expect(paletteFor('ios', false)).toMatchObject({ bg: '#F2F2F7', surface: '#FFFFFF', ink: '#000000', accent: '#0040DD' });
    expect(paletteFor('ios', true)).toMatchObject({ bg: '#000000', surface: '#1C1C1E', ink: '#FFFFFF', accent: '#409CFF' });
    expect(paletteFor('android', false)).toMatchObject({ bg: '#F9F9FF', ink: '#1A1B20', accent: '#445E91', accentInk: '#FFFFFF' });
    expect(paletteFor('android', true)).toMatchObject({ bg: '#111318', ink: '#E2E2E9', accent: '#ADC6FF', accentInk: '#102F60' });
    expect(paletteFor('web', false)).toEqual(paletteFor('ios', false));
  });

  it.each([
    ['ios', false], ['ios', true], ['android', false], ['android', true],
  ] as const)('DS-COLOR: every text pair is 4.5:1 or better (%s, dark %s)', (os, dark) => {
    const c = paletteFor(os, dark);
    const pairs: [string, string, string][] = [
      ['ink on bg', c.ink, c.bg], ['ink on surface', c.ink, c.surface], ['muted on bg', c.muted, c.bg], ['muted on surface', c.muted, c.surface],
      ['accent text on surface', c.accent, c.surface], ['accent text on bg', c.accent, c.bg], ['button text on accent', c.accentInk, c.accent],
      ['ink on accentSoft', c.ink, c.accentSoft], ['safe on safeSoft', c.safe, c.safeSoft], ['danger text', c.onDanger, c.danger],
      ['danger on surface', c.danger, c.surface], ['ink on fill', c.ink, c.fill], ['button text on fill', c.accent, c.fill],
    ];
    for (const [name, fg, bg] of pairs) expect({ name, ok: contrast(fg, bg) >= 4.5 }).toEqual({ name, ok: true });
  });

  it('DS-3 / DS-5: every tab has an SF Symbol, a Material icon and a word, and labels never hide or shrink', () => {
    for (const t of [...tabsFor('owner'), ...tabsFor('viewer')]) {
      expect(TAB_ICONS[t.name]).toEqual({ sf: expect.any(String), md: expect.any(String) });
      expect(t.label).toMatch(/\w/);
    }
    expect(NATIVE_TAB_OPTIONS).toMatchObject({ minimizeBehavior: 'never', labelVisibilityMode: 'labeled' });
    expect(NATIVE_TAB_OPTIONS.labelStyle.fontSize).toBeGreaterThanOrEqual(17);
  });

  it('DS-1 / DS-3: a button with an icon still shows its word and is 48 pt', () => {
    render(<Button label="Close" icon={{ sf: 'xmark', md: 'close' }} onPress={() => {}} />);
    expect(screen.getByText('Close')).toBeTruthy();
    expectGrandparentSafe();
  });
});
