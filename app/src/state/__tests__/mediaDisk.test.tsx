// A3 wiring: the app keeps photo files only through deps.mediaDisk, prunes them to the feed, and wipes them at sign-out.
import { act, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FakeBackend } from '../../api/fake/FakeBackend';
import { memoryMediaStore } from '../../media/diskCache';
import { memoryKV } from '../../platform/kv';
import { MediaImage } from '../../screens/MediaImage';
import { seedPost } from '../../test/seed';
import { renderApp } from '../../test/renderApp';
import { useApp } from '../AppContext';

let app: ReturnType<typeof useApp> | null = null;
function Probe({ postId, mediaId }: { postId: string; mediaId: string }) {
  app = useApp();
  return <MediaImage postId={postId} mediaId={mediaId} />;
}

describe('A3 kept photos in the app', () => {
  it('A3-6: a viewed photo is kept, and signing out wipes the files and keys', async () => {
    const be = FakeBackend.withFixture();
    const { id } = await seedPost(be, { caption: 'Kept' });
    const mediaId = Object.values(be.state.media).find((m) => m.post === id)!.id;
    const store = memoryMediaStore();
    const keys = memoryKV();
    await renderApp(<Probe postId={id} mediaId={mediaId} />, { be, user: 'jo', deps: { mediaDisk: { store, keys } } });
    await waitFor(() => expect(screen.UNSAFE_queryAllByProps({ blurRadius: 0 }).length).toBeGreaterThan(0));
    await act(async () => { await app!.media!.flush(); });
    expect(Object.keys(store.dump()).length).toBeGreaterThan(0);
    await act(async () => { await app!.signOut(); });
    expect(store.dump()).toEqual({});
    expect(JSON.stringify(keys.dump())).not.toContain(mediaId);
  });
});
