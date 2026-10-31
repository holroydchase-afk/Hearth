// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// The demo build's frame around the app (web only): the demo bar above every screen, and on a
// laptop the phone-width column beside the story panel (DemoFrame).
import React, { useState, type ReactNode } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import type { FakeBackend } from '../api/fake/FakeBackend';
import { DemoBar } from './DemoBar';
import { DemoFrame } from './DemoFrame';
import { DEMO_MODE } from './flags';
import { webStorage } from '../platform/webStorage';
import { demoKeysToClear } from './seed';

const BASE = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
const goPhotos = () => window.location.assign(`${BASE}/photos`);

// DEMO-BAR: after Reset demo the drawer opens once and says the sample data is back.
const RESTORED = 'hearthDemoRestored';
function takeRestored(): boolean {
  try {
    const was = window.sessionStorage.getItem(RESTORED) === '1';
    window.sessionStorage.removeItem(RESTORED);
    return was;
  } catch { return false; }
}

function startOver() {
  try { window.sessionStorage.setItem(RESTORED, '1'); } catch { /* no note, still a fresh family */ }
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
  const [restored] = useState(() => DEMO_MODE && Platform.OS === 'web' && takeRestored());
  if (!DEMO_MODE || Platform.OS !== 'web' || !be) return <>{children}</>;
  return (
    <DemoFrame width={width} open={(url) => window.location.assign(url)}>
      <View style={{ flex: 1 }}>
        <DemoBar be={be} reload={goPhotos} startOver={startOver} open={(url) => window.location.assign(url)} restored={restored} />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </DemoFrame>
  );
}
