import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ApiError } from '../../api/HearthApi';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { JoinScreen } from '../JoinScreen';
import { SignInScreen } from '../SignInScreen';

async function fresh() {
  const be = FakeBackend.withFixture({ joIsMember: false });
  await seedPost(be, { caption: 'For the grandparents', circles: [FIXTURE.circles.dadSide.id] });
  return be;
}

async function typeEmailAndCode(code: string) {
  fireEvent.changeText(await screen.findByLabelText('Your email'), 'jo@example.com');
  fireEvent.press(screen.getByRole('button', { name: 'Send me a code' }));
  fireEvent.changeText(await screen.findByLabelText('6-number code'), code);
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
}

describe('Join (BETA-JOIN-1, -3)', () => {
  it('invite → "Chase invited you" → email → 6-digit code → Photos, never a password', async () => {
    const be = await fresh();
    const { nav } = await renderApp(<JoinScreen code={FIXTURE.invites.jo} />, { be, user: null });
    expect(await screen.findByText('Chase invited you to see the family photos.')).toBeTruthy();
    expect(screen.getByText('No password. Free.')).toBeTruthy();
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: 'See the photos' }));
    await typeEmailAndCode('123456');
    await waitFor(() => expect(nav.goPhotos).toHaveBeenCalled());
    const feed = await be.clientFor(FIXTURE.users.jo.id).getFeed({ space: FIXTURE.space.id });
    expect(feed.map((p) => p.caption)).toEqual(['For the grandparents']);
  });

  it('HARD-10 no signal while opening the invite: an honest message and a Try again that works', async () => {
    const be = await fresh();
    const api = be.clientFor(null, { trackAppSession: true });
    jest.spyOn(api, 'invitePreview').mockRejectedValueOnce(new ApiError('NETWORK'));
    await renderApp(<JoinScreen code={FIXTURE.invites.jo} />, { be, user: null, deps: { api } });
    expect(await screen.findByText(/No internet right now/)).toBeTruthy();
    expect(screen.queryByText(/keep trying/)).toBeNull(); // nothing retries on its own here
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Chase invited you to see the family photos.')).toBeTruthy();
  });

  it('HARD-10 no signal while joining after sign-in: Try again joins', async () => {
    const be = await fresh();
    const api = be.clientFor(null, { trackAppSession: true });
    jest.spyOn(api, 'redeemInvite').mockRejectedValueOnce(new ApiError('NETWORK'));
    const { nav } = await renderApp(<JoinScreen code={FIXTURE.invites.jo} />, { be, user: null, deps: { api } });
    fireEvent.press(await screen.findByRole('button', { name: 'See the photos' }));
    await typeEmailAndCode('123456');
    expect(await screen.findByText(/No internet right now/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(nav.goPhotos).toHaveBeenCalled());
  });

  it('a wrong code shows the plain message and lets her try again', async () => {
    const be = await fresh();
    await renderApp(<JoinScreen code={FIXTURE.invites.jo} />, { be, user: null });
    fireEvent.press(await screen.findByRole('button', { name: 'See the photos' }));
    await typeEmailAndCode('111111');
    expect(await screen.findByText("That code didn't work. Check the newest email from Hearth and type the 6 numbers again.")).toBeTruthy();
    expect(screen.getByLabelText('6-number code')).toBeTruthy();
    expectGrandparentSafe();
  });

  it('an old invite says what to do, without the word "expired"', async () => {
    const be = await fresh();
    await renderApp(<JoinScreen code={FIXTURE.invites.expired} />, { be, user: null });
    expect(await screen.findByText('This invite is too old or already used. Ask the person who invited you for a new one.')).toBeTruthy();
    expect(screen.queryByText(/expired/i)).toBeNull();
  });

  it('an invite for someone else is refused after sign-in, naming the inviter', async () => {
    const be = await fresh();
    await renderApp(<JoinScreen code={FIXTURE.invites.jo} />, { be, user: null });
    fireEvent.press(await screen.findByRole('button', { name: 'See the photos' }));
    fireEvent.changeText(await screen.findByLabelText('Your email'), 'stranger@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Send me a code' }));
    fireEvent.changeText(await screen.findByLabelText('6-number code'), '123456');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    // June signed in with her Gmail; Chase sent it to her Yahoo. The server can't say which (BETA-JOIN-3),
    // so the screen names the email she used and every reason, with a way to try another email.
    expect(await screen.findByText("This invite didn't open for stranger@example.com.")).toBeTruthy();
    expect(screen.getByText('It may be old or already used, or Chase sent it to a different email. Try that email, or ask Chase for a new invite.')).toBeTruthy();
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: 'Try a different email' }));
    expect(await screen.findByLabelText('Your email')).toBeTruthy();
  });

  it('UX-G7: an invite to a retired group says so before she types anything, naming the inviter', async () => {
    const be = await fresh();
    be.state.circles[FIXTURE.circles.dadSide.id]!.deleted = true;
    await renderApp(<JoinScreen code={FIXTURE.invites.jo} />, { be, user: null });
    expect(await screen.findByText('This invite is too old or already used. Ask Chase for a new one.')).toBeTruthy();
    expect(screen.queryByText('Chase invited you to see the family photos.')).toBeNull();
    expect(screen.queryByLabelText('Your email')).toBeNull();
    expectGrandparentSafe();
  });

  it('UX-G8: already signed in, a refused invite names the inviter instead of "the person who invited you"', async () => {
    const be = await fresh();
    be.state.invites.OTHERMAIL2 = { ...be.state.invites[FIXTURE.invites.jo]!, code: 'OTHERMAIL2', target_email: 'someone.else@example.com' };
    await renderApp(<JoinScreen code="OTHERMAIL2" />, { be, user: 'jo' });
    expect(await screen.findByText('This invite is too old or already used. Ask Chase for a new one.')).toBeTruthy();
    expect(screen.queryByText(/the person who invited you/)).toBeNull();
  });

  it('UX-G9: already signed in, the refused-invite screen has one verb button, "Go to Photos"', async () => {
    const be = await fresh();
    be.state.invites.OTHERMAIL3 = { ...be.state.invites[FIXTURE.invites.jo]!, code: 'OTHERMAIL3', target_email: 'someone.else@example.com' };
    const { nav } = await renderApp(<JoinScreen code="OTHERMAIL3" />, { be, user: 'jo' });
    expect(await screen.findByText('This invite is too old or already used. Ask Chase for a new one.')).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Go to Photos']);
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: 'Go to Photos' }));
    expect(nav.goPhotos).toHaveBeenCalled();
  });

  it('already signed in and already in the family: straight to the photos', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    const { nav } = await renderApp(<JoinScreen code={FIXTURE.invites.jo} />, { be, user: 'jo' });
    await waitFor(() => expect(nav.goPhotos).toHaveBeenCalled());
  });
});

describe('Sign in', () => {
  it('email → code → Photos', async () => {
    const be = FakeBackend.withFixture();
    const { nav } = await renderApp(<SignInScreen />, { be, user: null });
    expect(await screen.findByText('Welcome to Hearth')).toBeTruthy();
    fireEvent.changeText(await screen.findByLabelText('Your email'), 'ruth@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Send me a code' }));
    fireEvent.changeText(await screen.findByLabelText('6-number code'), '123456');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(nav.goPhotos).toHaveBeenCalled());
  });

  it('S10: too many tries is plain', async () => {
    const be = FakeBackend.withFixture();
    const api = be.clientFor(null, { trackAppSession: true });
    const { ApiError } = jest.requireActual('../../api/HearthApi');
    jest.spyOn(api, 'verifyCode').mockRejectedValue(new ApiError('54000'));
    await renderApp(<SignInScreen />, { be, user: null, deps: { api } });
    fireEvent.changeText(await screen.findByLabelText('Your email'), 'ruth@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Send me a code' }));
    fireEvent.changeText(await screen.findByLabelText('6-number code'), '123456');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Too many tries. Wait 10 minutes.')).toBeTruthy();
  });
});
