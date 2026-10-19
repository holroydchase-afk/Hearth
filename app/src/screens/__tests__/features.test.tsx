// FLAG-5 (SPEC-GROUPS v2 section 5): the app reads my_features(space) at start; video posting is a server
// switch now, not a constant in the app. Written first: red until the app catches up.
import { readFileSync } from 'fs';
import { join } from 'path';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { ShareScreen } from '../ShareScreen';

function videoOn(): FakeBackend {
  const be = FakeBackend.withFixture();
  be.state.featureFlags = { video_posting: true };
  be.state.spaceFeatures = { [`${FIXTURE.space.id}:video_posting`]: true };
  return be;
}

describe('FLAG-5 features come from the server', () => {
  it('FLAG-5 the app reads my_features for its family when it starts', async () => {
    const be = FakeBackend.withFixture();
    const api = be.clientFor(null, { trackAppSession: true });
    const myFeatures = jest.spyOn(api, 'myFeatures');
    await renderApp(<ShareScreen />, { be, user: 'chase', deps: { api } });
    await waitFor(() => expect(myFeatures).toHaveBeenCalledWith(FIXTURE.space.id));
  });

  it('FLAG-5 VIDEO_POSTING_ENABLED is gone from media/prepare.ts', () => {
    const src = readFileSync(join(__dirname, '../../media/prepare.ts'), 'utf8');
    expect(src).not.toContain('VIDEO_POSTING_ENABLED');
  });

  it('FLAG-5 video_posting off: only photos are offered', async () => {
    const { deps } = await renderApp(<ShareScreen />, { user: 'chase' });
    const pick = await screen.findByRole('button', { name: 'Pick photos from your phone' });
    expect(screen.queryByRole('button', { name: 'Pick photos or videos from your phone' })).toBeNull();
    expect(screen.queryByText(/video/i)).toBeNull();
    fireEvent.press(pick);
    await waitFor(() => expect(deps.pickPhotos).toHaveBeenCalledWith({ videos: false }));
  });

  it('FLAG-5 video_posting on: the picker offers photos or videos', async () => {
    const { deps } = await renderApp(<ShareScreen />, { be: videoOn(), user: 'chase' });
    const pick = await screen.findByRole('button', { name: 'Pick photos or videos from your phone' });
    expect(screen.getByText('Pick photos or videos')).toBeTruthy();
    expectGrandparentSafe();
    fireEvent.press(pick);
    await waitFor(() => expect(deps.pickPhotos).toHaveBeenCalledWith({ videos: true }));
  });

  it('FLAG-5 a failed my_features read leaves video off', async () => {
    const be = videoOn();
    const api = be.clientFor(null, { trackAppSession: true });
    jest.spyOn(api, 'myFeatures').mockRejectedValue(new Error('offline'));
    await renderApp(<ShareScreen />, { be, user: 'chase', deps: { api } });
    expect(await screen.findByRole('button', { name: 'Pick photos from your phone' })).toBeTruthy();
  });
});
