// Hearth look, from prototype/hearth.html: Young Serif display, Figtree body, amber accent.
// Sizes: nothing under 17 pt (UX-REVIEW #3). RN Text scales with the phone's text size
// (Dynamic Type / Android font scale) because we never turn allowFontScaling off.
import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

export const palette = {
  light: {
    bg: '#F5F3F8', surface: '#FFFFFF', ink: '#2A2135', muted: '#5E5569', line: '#E3DEEA',
    accent: '#E59B2E', accentInk: '#3B2500', accentSoft: '#FCEFD9',
    safe: '#2F6146', safeSoft: '#E3F0E8', danger: '#A93A2A', onDanger: '#FFFFFF', scrim: 'rgba(30,22,40,0.55)', photo: '#E3DEEA',
  },
  dark: {
    bg: '#16121B', surface: '#211B28', ink: '#F0EBF4', muted: '#B9B0C3', line: '#352D3F',
    accent: '#F0AE4E', accentInk: '#2A1A00', accentSoft: '#3A2C17',
    safe: '#8CC3A2', safeSoft: '#1F3328', danger: '#F08A78', onDanger: '#2A0F0A', scrim: 'rgba(0,0,0,0.7)', photo: '#352D3F',
  },
};
export type Colors = typeof palette.light;

export const fonts = {
  display: 'YoungSerif_400Regular',
  body: 'Figtree_400Regular',
  bodyBold: 'Figtree_700Bold',
  bodySemi: 'Figtree_600SemiBold',
};

export const MIN_TARGET = 48;

export function typeScale(bigText: boolean) {
  const base = bigText ? 21 : 17;
  return { base, title: Math.round(base * 1.3), display: Math.round(base * 1.6), line: Math.round(base * 1.4) };
}

export interface Theme { c: Colors; t: ReturnType<typeof typeScale>; bigText: boolean; dark: boolean }

export const BigTextContext = createContext(false);

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const bigText = useContext(BigTextContext);
  const dark = scheme === 'dark';
  return { c: dark ? palette.dark : palette.light, t: typeScale(bigText), bigText, dark };
}
