// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// DEMO-BAR review (ux-reviewer P1): Grandma Jo's view lives in the demo bar's Details drawer, so on a phone
// the parent's Photos carries one tip line pointing to it. Beside the laptop story panel it isn't needed.
import React from 'react';
import { Platform } from 'react-native';
import type { FakeBackend } from '../api/fake/FakeBackend';
import { Txt } from '../ui/kit';
import { WIDE } from './DemoFrame';
import { DEMO_MODE } from './flags';
import { demoViewer } from './seed';

export function demoTip(width: number, viewer: 'parent' | 'grandma'): string | null {
  return width < WIDE && viewer === 'parent' ? 'Tip: tap Details, then See it as Grandma Jo.' : null;
}

export function DemoTip({ text }: { text: string }) {
  return <Txt variant="muted" testID="demo-tip">{text}</Txt>;
}

/** Photos header: the tip in the demo build on the web, else nothing. */
export function PhotosDemoTip({ width }: { width: number }) {
  const be = (globalThis as { __hearthFake?: FakeBackend }).__hearthFake;
  if (!DEMO_MODE || Platform.OS !== 'web' || !be) return null;
  const text = demoTip(width, demoViewer(be));
  return text ? <DemoTip text={text} /> : null;
}
