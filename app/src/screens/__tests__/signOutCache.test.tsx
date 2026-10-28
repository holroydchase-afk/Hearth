// HARD-13 (privacy review, Oct 28): the feed cache (captions, names, reactions) leaves the phone with the person.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { memoryKV, type KV } from '../../platform/kv';
import { seedPost } from '../../test/seed';
import { renderApp } from '../../test/renderApp';
import { MeScreen } from '../MeScreen';
import { PhotosScreen } from '../PhotosScreen';

jest.mock('../../demo/flags', () => ({ DEMO_MODE: false }));

describe('HARD-13 sign out', () => {
  it('HARD-13 sign out removes every hearth.feedCache key for that person', async () => {
    const be = FakeBackend.withFixture();
    await seedPost(be, { author: FIXTURE.users.alex.id, caption: 'Secret caption' });
    const inner = memoryKV();
    const live = new Set<string>();
    const kv: KV = {
      getItem: (k) => inner.getItem(k),
      setItem: async (k, v) => { live.add(k); await inner.setItem(k, v); },
      removeItem: async (k) => { live.delete(k); await inner.removeItem(k); },
    };
    const first = await renderApp(<PhotosScreen />, { be, kv, user: 'chase' });
    await screen.findByText('Secret caption');
    await waitFor(() => expect([...live].some((k) => k.startsWith('hearth.feedCache'))).toBe(true));
    first.unmount();
    await renderApp(<MeScreen />, { be, kv, user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out of Hearth' }));
    fireEvent.press(screen.getByRole('button', { name: 'Yes, sign out' }));
    await waitFor(() => expect([...live].filter((k) => k.startsWith('hearth.feedCache'))).toEqual([]));
  });
});
