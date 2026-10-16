// AE-2: the app tells the server where to send notices (push token + choice per space).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE } from '../../api/fake/FakeBackend';
import { registerForPush } from '../../notify/push';
import { renderApp } from '../../test/renderApp';
import { HelpScreen } from '../../screens/HelpScreen';
import { serverPrefs } from '../prefs';

const jo = FIXTURE.users.jo.id;
const space = FIXTURE.space.id;
const mockedRegister = registerForPush as jest.MockedFunction<typeof registerForPush>;

describe('notification sync (AE-2)', () => {
  it('BETA-NOTIFY-5: each Help choice maps to the server setting', () => {
    expect(serverPrefs('push')).toEqual({ push: true, emailDigest: 'off' });
    expect(serverPrefs('evening')).toEqual({ push: false, emailDigest: 'daily' });
    expect(serverPrefs('sunday')).toEqual({ push: false, emailDigest: 'weekly' });
  });

  it('BETA-NOTIFY-5: picking "email every evening" is saved on the server for her space', async () => {
    const { be } = await renderApp(<HelpScreen />, { user: 'jo' });
    fireEvent.press(await screen.findByRole('radio', { name: "An email every evening with the day's new photos" }));
    await waitFor(() => expect(be.state.notifyPrefs?.[`${jo}:${space}`]).toEqual({ push: false, emailDigest: 'daily' }));
  });

  it('AE-2: when the phone allows notices, its token is saved for the signed-in person', async () => {
    mockedRegister.mockResolvedValueOnce('ExponentPushToken[jo-phone]');
    const { be } = await renderApp(<HelpScreen />, { user: 'jo' });
    await waitFor(() => expect(be.state.pushTokens?.['ExponentPushToken[jo-phone]']?.user).toBe(jo));
  });

  it('AE-2: no token (push not allowed or not set up) saves nothing and shows no error', async () => {
    const { be } = await renderApp(<HelpScreen />, { user: 'jo' });
    expect(await screen.findByText('You can look at photos and write back.')).toBeTruthy();
    expect(be.state.pushTokens ?? {}).toEqual({});
  });
});
