// Native first (docs/product/DESIGN-SYSTEM.md): each phone's own font, colors and type ramp,
// plus Hearth's overrides (DS-1..DS-9). Nothing under 17 pt (DS-2). RN Text scales with the
// phone's text size (Dynamic Type / Android font scale) because we never turn allowFontScaling off.
import { createContext, useContext } from 'react';
import { Platform, useColorScheme } from 'react-native';

export type OS = 'ios' | 'android' | 'web';

export interface Colors {
  bg: string; surface: string; ink: string; muted: string; line: string;
  accent: string; accentInk: string; accentSoft: string; fill: string;
  safe: string; safeSoft: string; danger: string; onDanger: string; scrim: string; photo: string;
}

// iPhone: Apple's system colors (HIG "Color"), opaque, using the Increase Contrast variants where the
// standard ones miss 4.5:1 (systemBlue, systemGray, systemRed). Green is darker still: Apple's
// accessible systemGreen (#248A3D) is only 3.8:1 on its tint, so Hearth uses #1C6E31 (DS override).
const ios: { light: Colors; dark: Colors } = {
  light: {
    bg: '#F2F2F7', surface: '#FFFFFF', ink: '#000000', muted: '#6C6C70', line: '#C6C6C8',
    accent: '#0040DD', accentInk: '#FFFFFF', accentSoft: '#E5ECFC', fill: '#EFEFF0',
    safe: '#1C6E31', safeSoft: '#E3F3E7', danger: '#D70015', onDanger: '#FFFFFF', scrim: 'rgba(0,0,0,0.4)', photo: '#E5E5EA',
  },
  dark: {
    bg: '#000000', surface: '#1C1C1E', ink: '#FFFFFF', muted: '#AEAEB2', line: '#38383A',
    accent: '#409CFF', accentInk: '#000000', accentSoft: '#0B2447', fill: '#2C2C2E',
    safe: '#30DB5B', safeSoft: '#0E2A16', danger: '#FF6961', onDanger: '#000000', scrim: 'rgba(0,0,0,0.6)', photo: '#2C2C2E',
  },
};

// Android: a Material 3 scheme (tonal spot) from systemBlue, made with Google's material-color-utilities,
// so both phones read as blue. Success green is a Material tonal palette harmonized to the same seed.
const android: { light: Colors; dark: Colors } = {
  light: {
    bg: '#F9F9FF', surface: '#FFFFFF', ink: '#1A1B20', muted: '#44474F', line: '#C4C6D0',
    accent: '#445E91', accentInk: '#FFFFFF', accentSoft: '#DBE2F9', fill: '#DBE2F9',
    safe: '#246A4B', safeSoft: '#BFFFDA', danger: '#BA1A1A', onDanger: '#FFFFFF', scrim: 'rgba(0,0,0,0.32)', photo: '#E8E7EE',
  },
  dark: {
    bg: '#111318', surface: '#1E1F25', ink: '#E2E2E9', muted: '#C4C6D0', line: '#44474F',
    accent: '#ADC6FF', accentInk: '#102F60', accentSoft: '#3F4759', fill: '#3F4759',
    safe: '#8FD5AF', safeSoft: '#003823', danger: '#FFB4AB', onDanger: '#690005', scrim: 'rgba(0,0,0,0.32)', photo: '#282A2F',
  },
};

/** The web viewer follows the iPhone column (DESIGN-SYSTEM.md). */
export function paletteFor(os: OS, dark: boolean): Colors {
  const set = os === 'android' ? android : ios;
  return dark ? set.dark : set.light;
}

/** undefined = the phone's own font (SF Pro on iPhone, Roboto or the maker's font on Android). */
export function systemFontFamily(os: OS): string | undefined {
  return os === 'web' ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : undefined;
}

export const fontFamily = systemFontFamily(Platform.OS as OS);

export const MIN_TARGET = 48;

/** HIG text styles at the default size (Body 17, Title 2 22, Title 1 28); Material's ramp raised to match (DS-2). */
export function typeScale(bigText: boolean) {
  const base = bigText ? 21 : 17;
  return { base, title: Math.round(base * 1.3), display: Math.round(base * 1.65), line: Math.round(base * 1.3) };
}

/** WCAG 2 contrast ratio of two opaque #RRGGBB colors. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b2] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b2!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

export interface Theme { c: Colors; t: ReturnType<typeof typeScale>; bigText: boolean; dark: boolean; os: OS }

export const BigTextContext = createContext(false);

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const bigText = useContext(BigTextContext);
  const dark = scheme === 'dark';
  const os = Platform.OS as OS;
  return { c: paletteFor(os, dark), t: typeScale(bigText), bigText, dark, os };
}
