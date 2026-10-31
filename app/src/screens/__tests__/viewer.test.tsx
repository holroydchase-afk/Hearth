// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FakeBackend } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { useApp } from '../../state/AppContext';
import { ViewerScreen } from '../ViewerScreen';

async function setup() {
  const be = FakeBackend.withFixture();
  const older = await seedPost(be, { caption: 'Older one', photos: 1 });
  const newer = await seedPost(be, { caption: 'Two at the lake', photos: 2 });
  return { be, older, newer };
}

describe('Full-screen viewer (BETA-SEE-3, BETA-SEE-5, UXG-08..10)', () => {
  it('says who sent it and when, shows the caption, and Back/Next move across photos', async () => {
    const { be, newer } = await setup();
    await renderApp(<ViewerScreen postId={newer.id} index={0} />, { be, user: 'jo' });
    expect(await screen.findByText(/^From Chase · /)).toBeTruthy();
    expect(screen.getByText('Two at the lake')).toBeTruthy();
    expect(screen.getByText('Photo 1 of 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to the previous photo' })).toBeNull(); // hidden on the first
    fireEvent.press(screen.getByRole('button', { name: 'Next photo' }));
    expect(await screen.findByText('Photo 2 of 3')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Next photo' }));
    expect(await screen.findByText('Photo 3 of 3')).toBeTruthy();
    expect(screen.getByText('Older one')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next photo' })).toBeNull(); // hidden on the last
    fireEvent.press(screen.getByRole('button', { name: 'Back to the previous photo' }));
    expect(await screen.findByText('Photo 2 of 3')).toBeTruthy();
  });

  it('HARD-8 a new post arriving while you look never swaps the photo on screen', async () => {
    const { be, newer } = await setup();
    let app: ReturnType<typeof useApp> | null = null;
    const Grab = () => { app = useApp(); return null; };
    await renderApp(<><Grab /><ViewerScreen postId={newer.id} index={0} /></>, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Next photo' }));
    expect(await screen.findByText('Photo 2 of 3')).toBeTruthy();
    await seedPost(be, { caption: 'Brand new', photos: 1 });
    await act(async () => { await app!.feed!.refresh(); });
    expect(await screen.findByText('Photo 3 of 4')).toBeTruthy();
    expect(screen.getByText('Two at the lake')).toBeTruthy();
    expect(screen.queryByText('Brand new')).toBeNull();
  });

  it('Close goes back to the same place in the photos', async () => {
    const { be, newer } = await setup();
    const { nav } = await renderApp(<ViewerScreen postId={newer.id} index={1} />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Close' }));
    expect(nav.close).toHaveBeenCalled();
  });

  it('"Save to my phone" saves the decrypted photo and says so plainly', async () => {
    const { be, newer } = await setup();
    const { deps } = await renderApp(<ViewerScreen postId={newer.id} index={1} />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Save to my phone' }));
    expect(await screen.findByText('Saved to your phone.')).toBeTruthy();
    expect(deps.saveToPhone).toHaveBeenCalledWith(newer.plains[1], expect.stringMatching(/^hearth-/));
  });

  it('if the phone says no, it explains what to do', async () => {
    const { be, newer } = await setup();
    await renderApp(<ViewerScreen postId={newer.id} index={0} />, { be, user: 'jo', deps: { saveToPhone: jest.fn(async () => 'denied' as const) } });
    fireEvent.press(await screen.findByRole('button', { name: 'Save to my phone' }));
    expect(await screen.findByText('Your phone said no. Tap "Allow" when your phone asks, then try again.')).toBeTruthy();
  });

  it('a photo that was deleted shows "This was removed."', async () => {
    const { be, newer } = await setup();
    await be.clientFor('00000000-0000-4000-8000-000000000001').deletePost(newer.id);
    await renderApp(<ViewerScreen postId={newer.id} index={0} />, { be, user: 'jo' });
    expect(await screen.findByText('This was removed.')).toBeTruthy();
  });

  it('is grandparent-safe', async () => {
    const { be, newer } = await setup();
    await renderApp(<ViewerScreen postId={newer.id} index={1} />, { be, user: 'jo' });
    await screen.findByText('Photo 2 of 3');
    await waitFor(() => expect(screen.queryByText('Loading the photo…')).toBeNull());
    expectGrandparentSafe();
  });
});
