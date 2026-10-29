// The demo build's frame around the app (web only): the demo bar above every screen, and on a
// laptop the phone-width column beside the story panel (DemoFrame).
import React, { type ReactNode } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import type { FakeBackend } from '../api/fake/FakeBackend';
import { DemoBar } from './DemoBar';
import { DemoFrame } from './DemoFrame';
import { DEMO_MODE } from './flags';
import { webStorage } from '../platform/webStorage';
import { demoKeysToClear } from './seed';

const BASE = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
const goPhotos = () => window.location.assign(`${BASE}/photos`);

function startOver() {
  try {
    const ls = webStorage();
    if (!ls) throw new Error('storage blocked');
    const keys = Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter((k): k is string => k != null);
    for (const k of demoKeysToClear(keys)) ls.removeItem(k);
  } catch { /* storage blocked: the reload still starts a fresh family in memory */ }
  goPhotos();
}

export function DemoChrome({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const be = (globalThis as { __hearthFake?: FakeBackend }).__hearthFake;
  if (!DEMO_MODE || Platform.OS !== 'web' || !be) return <>{children}</>;
  return (
    <DemoFrame width={width} open={(url) => window.location.assign(url)}>
      <View style={{ flex: 1 }}>
        <DemoBar be={be} reload={goPhotos} startOver={startOver} open={(url) => window.location.assign(url)} />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </DemoFrame>
  );
}
