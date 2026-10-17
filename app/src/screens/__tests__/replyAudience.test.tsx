// BETA-AUD-10: the family owner picks who reads what relatives write; safest is the default.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { MeScreen } from '../MeScreen';

describe('who reads replies (BETA-AUD-10)', () => {
  it("BETA-AUD-10: the owner sees the safe default and can open it to everyone", async () => {
    const be = FakeBackend.withFixture();
    await renderApp(<MeScreen />, { be, user: 'chase' });
    const safe = await screen.findByRole('radio', { name: "The parents, plus their own household and events (safest)" });
    expect(safe.props.accessibilityState).toMatchObject({ checked: true });
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('radio', { name: 'Everyone the photo was shared with' }));
    await waitFor(() => expect(be.state.spaces[FIXTURE.space.id]!.reply_audience).toBe('everyone'));
  });

  it('BETA-AUD-10: nobody but the owner is offered the choice', async () => {
    const be = FakeBackend.withFixture();
    be.state.members.find((m) => m.user === FIXTURE.users.alex.id)!.role = 'adult';
    await renderApp(<MeScreen />, { be, user: 'alex' });
    await screen.findByText(/Signed in as/);
    expect(screen.queryByRole('radio', { name: "The parents, plus their own household and events (safest)" })).toBeNull();
  });

  it('S-0011-5 / BETA-REPLY-12: the words match 0011 (households and events read each other; no per-group switch)', async () => {
    const be = FakeBackend.withFixture();
    await renderApp(<MeScreen />, { be, user: 'chase' });
    await screen.findByRole('radio', { name: "The parents, plus their own household and events (safest)" });
    expect(screen.queryByText(/Only the kids' parents/)).toBeNull();
    expect(screen.queryByText(/Groups can also be set/)).toBeNull();
    expect(screen.getByText(/People in the same household, or in the same event, read each other's/)).toBeTruthy();
  });
});
