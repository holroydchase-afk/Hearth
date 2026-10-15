import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { expectGrandparentSafe, renderApp, screenWords } from '../../test/renderApp';
import { HelpScreen } from '../HelpScreen';
import { MeScreen } from '../MeScreen';

describe('Help tab (viewers) — UXG-14', () => {
  it('puts "Call Chase" first and it dials', async () => {
    const { deps } = await renderApp(<HelpScreen />, { user: 'jo' });
    const buttons = await screen.findAllByRole('button');
    expect(buttons[0]!.props.accessibilityLabel).toBe('Call Chase');
    fireEvent.press(buttons[0]!);
    expect(deps.openUrl).toHaveBeenCalledWith('tel:+13045550100');
  });

  it('Bigger text is ON by default for viewers and comes before the notice choices', async () => {
    await renderApp(<HelpScreen />, { user: 'jo' });
    const sw = await screen.findByRole('switch', { name: 'Bigger text' });
    expect(sw.props.accessibilityState).toMatchObject({ checked: true });
    const words = screenWords();
    expect(words.indexOf('Bigger text')).toBeLessThan(words.indexOf('How should we tell you about new photos?'));
    fireEvent.press(sw);
    expect(screen.getByRole('switch', { name: 'Bigger text' }).props.accessibilityState).toMatchObject({ checked: false });
  });

  it('notice choices are in plain words and confirm when picked', async () => {
    await renderApp(<HelpScreen />, { user: 'jo' });
    expect(await screen.findByRole('radio', { name: 'A sound on your phone when there are new photos (Recommended)' })).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: "An email every evening with the day's new photos" }));
    expect(await screen.findByText("Saved. We'll email you every evening when there are new photos.")).toBeTruthy();
  });

  it('says what she can do, and what privacy means, without scary words', async () => {
    await renderApp(<HelpScreen />, { user: 'jo' });
    expect(await screen.findByText('You can look at photos and write back.')).toBeTruthy();
    expect(screen.getByText('No computer program learns from your photos.')).toBeTruthy();
    expect(screenWords()).not.toMatch(/\b(feed|circles?|audience|sync|upload|notifications?|expired|account|settings|digest|servers?|encrypted|AI)\b/i);
  });

  it('is grandparent-safe', async () => {
    await renderApp(<HelpScreen />, { user: 'jo' });
    await screen.findByRole('switch', { name: 'Bigger text' });
    expectGrandparentSafe();
  });
});

describe('Me tab (posters)', () => {
  it('Bigger text is off by default for posters; sign out asks first', async () => {
    await renderApp(<MeScreen />, { user: 'chase' });
    expect((await screen.findByRole('switch', { name: 'Bigger text' })).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText('Signed in as chase@example.com')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Sign out of Hearth' }));
    expect(screen.getByText('Sign out of Hearth?')).toBeTruthy();
    expectGrandparentSafe();
  });
});
