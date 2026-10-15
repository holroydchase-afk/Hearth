import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ApiError } from '../../api/HearthApi';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { memoryKV } from '../../platform/kv';
import { saveLastAudience } from '../../share/audienceMemory';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { ShareScreen } from '../ShareScreen';

const DAD = "Grandparents – Dad's side";

describe('Share screen', () => {
  it('BETA-AUD-2 / B8: preselects THIS user\'s last group, in words', async () => {
    const kv = memoryKV();
    await saveLastAudience(kv, FIXTURE.users.chase.id, [FIXTURE.circles.dadSide.id]);
    await renderApp(<ShareScreen />, { user: 'chase', kv });
    const dad = await screen.findByRole('checkbox', { name: `${DAD}, 3 people` });
    expect(dad.props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('checkbox', { name: "Grandparents – Mom's side, 3 people" }).props.accessibilityState).toMatchObject({ checked: false });
  });

  it("B8: never another user's default on a shared phone; Post stays off with no group", async () => {
    const kv = memoryKV();
    await saveLastAudience(kv, FIXTURE.users.chase.id, [FIXTURE.circles.dadSide.id]);
    await renderApp(<ShareScreen />, { user: 'alex', kv });
    const boxes = await screen.findAllByRole('checkbox');
    for (const b of boxes) expect(b.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(screen.getByRole('button', { name: 'Pick photos from your phone' }));
    await screen.findByText('1 photo picked');
    expect(screen.getByRole('button', { name: 'Post' }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('Pick who should see it.')).toBeTruthy();
  });

  it('BETA-SHARE-1: pick → caption → Post, then it sends and remembers the choice', async () => {
    const be = FakeBackend.withFixture();
    const kv = memoryKV();
    const { nav } = await renderApp(<ShareScreen />, { be, user: 'chase', kv });
    fireEvent.press(await screen.findByRole('button', { name: 'Pick photos from your phone' }));
    await screen.findByText('1 photo picked');
    fireEvent.changeText(screen.getByLabelText("What's happening?"), 'First snow!');
    fireEvent.press(screen.getByRole('checkbox', { name: `${DAD}, 3 people` }));
    fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(nav.goPhotos).toHaveBeenCalled());
    await waitFor(async () => expect(await be.clientFor(FIXTURE.users.jo.id).getFeed({ space: FIXTURE.space.id })).toHaveLength(1));
    expect(await be.clientFor(FIXTURE.users.ruth.id).getFeed({ space: FIXTURE.space.id })).toHaveLength(0);
    expect(JSON.parse((await kv.getItem(`hearth.lastAudience.v1.${FIXTURE.users.chase.id}`))!)).toEqual([FIXTURE.circles.dadSide.id]);
  });

  it('BETA-SHARE-4: shows "Waiting to send" when there is no signal', async () => {
    const be = FakeBackend.withFixture();
    const api = be.clientFor(null, { trackAppSession: true });
    jest.spyOn(api, 'createPost').mockRejectedValue(new ApiError('NETWORK'));
    await renderApp(<ShareScreen />, { be, user: 'chase', deps: { api } });
    fireEvent.press(await screen.findByRole('button', { name: 'Pick photos from your phone' }));
    await screen.findByText('1 photo picked');
    fireEvent.press(screen.getByRole('checkbox', { name: `${DAD}, 3 people` }));
    fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByText(/Waiting to send/)).toBeTruthy();
  });

  it('a picked photo can be removed with a labeled button', async () => {
    await renderApp(<ShareScreen />, { user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: 'Pick photos from your phone' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Remove photo 1' }));
    expect(screen.queryByText('1 photo picked')).toBeNull();
  });

  it('viewers who land here are told plainly', async () => {
    await renderApp(<ShareScreen />, { user: 'jo' });
    expect(await screen.findByText("You can't do that here.")).toBeTruthy();
  });

  it('is grandparent-safe', async () => {
    await renderApp(<ShareScreen />, { user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: 'Pick photos from your phone' }));
    await screen.findByText('1 photo picked');
    expectGrandparentSafe();
  });
});
