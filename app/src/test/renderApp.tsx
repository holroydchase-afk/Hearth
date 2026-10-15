import { render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactElement } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { FakeBackend, FIXTURE, type FixtureOptions } from '../api/fake/FakeBackend';
import { encryptedSize } from '../crypto/media';
import { memoryKV, type KV } from '../platform/kv';
import { AppProvider, type AppDeps } from '../state/AppContext';
import { NavContext, type Nav } from '../state/nav';
import type { Prepared } from '../upload/queue';

export type FixtureUser = keyof typeof FIXTURE.users;

export function preparedFixture(): Prepared {
  const display = new Uint8Array(800).map((_, i) => (i * 5) & 0xff);
  const thumb = new Uint8Array(120).map((_, i) => (i * 9) & 0xff);
  return {
    spec: { kind: 'photo', mime_type: 'image/jpeg', width: 2048, height: 1536, duration_ms: null, byte_size: encryptedSize(display.length), thumb_byte_size: encryptedSize(thumb.length), exif_stripped: true },
    display, thumb,
  };
}

export async function renderApp(ui: ReactElement, opts: { user?: FixtureUser | null; be?: FakeBackend; kv?: KV; deps?: Partial<AppDeps>; fixture?: FixtureOptions; waitReady?: boolean } = {}) {
  const be = opts.be ?? FakeBackend.withFixture(opts.fixture);
  const user = opts.user === undefined ? 'jo' : opts.user;
  be.state.appSession = user ? FIXTURE.users[user].id : null;
  const api = be.clientFor(null, { trackAppSession: true });
  const kv = opts.kv ?? memoryKV();
  const nav: jest.Mocked<Nav> = { openViewer: jest.fn(), close: jest.fn(), goPhotos: jest.fn(), goSignIn: jest.fn() };
  const deps: AppDeps = {
    api, kv, helpPhone: '+1 304 555 0100',
    prepare: jest.fn(async () => preparedFixture()),
    pickPhotos: jest.fn(async () => ({ items: [{ uri: 'file:///pick/1.jpg', kind: 'photo' as const, width: 4032, height: 3024 }] })),
    saveToPhone: jest.fn(async () => 'saved' as const),
    openUrl: jest.fn(async () => true),
    ...opts.deps,
  };
  const utils = render(
    <AppProvider deps={deps}>
      <NavContext.Provider value={nav}>{ui}</NavContext.Provider>
    </AppProvider>,
  );
  if (opts.waitReady !== false && user) {
    await waitFor(() => expect(screen.queryByTestId('app-loading')).toBeNull());
  }
  return { ...utils, be, api, nav, deps, kv };
}

type Node = ReturnType<typeof screen.UNSAFE_getAllByType>[number];

const flat = (style: unknown) =>
  (StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false, hovered: false }) : style) ?? {}) as Record<string, unknown>;

/** Every tappable thing: labeled, ≥48 × 48. Every input: labeled, ≥48 tall. Every text ≥17 pt. */
export function expectGrandparentSafe(): void {
  // Pressable renders a host View carrying the responder handlers; find those.
  const pressables = screen.UNSAFE_root.findAll(
    (n: { type: unknown; props: Record<string, unknown> }) => typeof n.type === 'string' && typeof n.props.onResponderGrant === 'function' && n.props.accessible === true,
  );
  expect(pressables.length).toBeGreaterThan(0);
  for (const p of pressables) {
    const label = p.props.accessibilityLabel as string | undefined;
    expect({ label }).toEqual({ label: expect.stringMatching(/\S/) });
    const s = flat(p.props.style);
    const h = Number(s.minHeight ?? s.height ?? 0);
    const w = Number(s.minWidth ?? s.width ?? (s.flex || s.alignSelf === 'stretch' ? 999 : 0));
    expect({ label, h: h >= 48, w: w >= 48 }).toEqual({ label, h: true, w: true });
  }
  for (const i of screen.UNSAFE_queryAllByType(TextInput)) {
    expect(i.props.accessibilityLabel).toEqual(expect.stringMatching(/\S/));
    expect(Number(flat(i.props.style).minHeight ?? 0)).toBeGreaterThanOrEqual(48);
    expect(i.props.secureTextEntry).toBeFalsy(); // no passwords anywhere
  }
  for (const t of screen.UNSAFE_queryAllByType(Text) as Node[]) {
    const size = flat(t.props.style).fontSize;
    if (size !== undefined) expect({ text: String(t.props.children).slice(0, 40), size }).toEqual({ text: expect.any(String), size: expect.toBeAtLeast17() });
  }
}

/** All visible words on screen, for word-list checks. */
export function screenWords(): string {
  const parts: string[] = [];
  const walk = (c: unknown) => {
    if (typeof c === 'string' || typeof c === 'number') parts.push(String(c));
    else if (Array.isArray(c)) c.forEach(walk);
  };
  for (const t of screen.UNSAFE_queryAllByType(Text) as Node[]) walk(t.props.children);
  for (const i of screen.UNSAFE_queryAllByType(TextInput) as Node[]) parts.push(String(i.props.placeholder ?? ''));
  return parts.join(' ');
}

expect.extend({
  toBeAtLeast17(received: unknown) {
    const pass = typeof received === 'number' && received >= 17;
    return { pass, message: () => `expected font size ${String(received)} to be >= 17` };
  },
});
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Expect { toBeAtLeast17(): unknown }
    interface Matchers<R> { toBeAtLeast17(): R }
  }
}
