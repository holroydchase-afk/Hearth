// AE-10 / BETA-NOTIFY-1: posters can see and copy how fast notices reached this phone.
import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { Share } from 'react-native';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { memoryKV } from '../../platform/kv';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { MeScreen } from '../MeScreen';

describe('notice timing (AE-10)', () => {
  it('AE-10: the Me screen shows the timing report from this phone only', async () => {
    const be = FakeBackend.withFixture();
    const { id: post } = await seedPost(be, { author: FIXTURE.users.alex.id });
    const kv = memoryKV();
    const published = Date.parse(be.state.posts[post]!.published_at!);
    await kv.setItem(`hearth.latency.v1.${FIXTURE.users.chase.id}`, JSON.stringify([{ post_id: post, arrived_at: published + 7_000 }]));
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await renderApp(<MeScreen />, { be, kv, user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: 'Show notice timing' }));
    expect(await screen.findByText(/Posts measured: 1/)).toBeTruthy();
    expect(screen.getByText(/Half arrived within: 7 seconds/)).toBeTruthy();
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: 'Copy the report' }));
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('Posts measured: 1') });
    expect(JSON.stringify(share.mock.calls)).not.toContain(post);
  });
});
