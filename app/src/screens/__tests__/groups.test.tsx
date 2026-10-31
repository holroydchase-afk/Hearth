// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { GroupsScreen } from '../GroupsScreen';

describe('Groups (posters only)', () => {
  it('lists groups with members marked by ✓ and a count in words', async () => {
    await renderApp(<GroupsScreen />, { user: 'chase' });
    expect(await screen.findByText("Grandparents – Dad's side")).toBeTruthy();
    expect(screen.getAllByText('✓ Grandma Jo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 people').length).toBeGreaterThan(0);
    expectGrandparentSafe();
  });

  it('rename (basic editing)', async () => {
    const be = FakeBackend.withFixture();
    await renderApp(<GroupsScreen />, { be, user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: "Rename Grandparents – Dad's side" }));
    fireEvent.changeText(screen.getByLabelText('New name for this group'), "Dad's parents");
    fireEvent.press(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText("Dad's parents")).toBeTruthy();
    expect(be.state.circles[FIXTURE.circles.dadSide.id]!.name).toBe("Dad's parents");
  });

  it('invite someone: makes a link that works for 30 days and a text to send', async () => {
    const { deps } = await renderApp(<GroupsScreen />, { user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: "Invite someone to Grandparents – Dad's side" }));
    fireEvent.press(await screen.findByRole('radio', { name: 'Share all past photos' })); // BETA-AUD-19: the parent picks share history first
    fireEvent.press(await screen.findByRole('button', { name: 'Make the invite' }));
    expect(await screen.findByText('Works for 30 days.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Text the invite' }));
    await waitFor(() => expect(deps.openUrl).toHaveBeenCalledWith(expect.stringMatching(/^sms:.*body=Hi.*thefreighttrains-team-hearth\.expo\.app%2Fjoin%2F/)));
    const sms = decodeURIComponent((deps.openUrl as jest.Mock).mock.calls[0][0]);
    expect(sms).not.toContain('hearth.family'); // ONB-3: not a domain we own
    expect(sms).toMatch(/Your code is [A-Z0-9]{5} [A-Z0-9]{5}\.$/); // BETA-JOIN-8
    expect(sms).toContain("Hi, it's Chase."); // NOTIFY-7: names the real sender, never "it's me"
    expect(sms).not.toContain("it's me");
    expect(sms).toContain("If that doesn't open, call me and I'll help.");
  });

  it('JOIN-1: the invite carries the name the family uses, so she types nothing', async () => {
    const be = FakeBackend.withFixture();
    await renderApp(<GroupsScreen />, { be, user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: "Invite someone to Grandparents – Dad's side" }));
    fireEvent.changeText(screen.getByLabelText('Their name, the way your family says it'), 'Grandma June');
    fireEvent.press(await screen.findByRole('radio', { name: 'Share all past photos' })); // BETA-AUD-19: the parent picks share history first
    fireEvent.press(screen.getByRole('button', { name: 'Make the invite' }));
    expect(await screen.findByText('Works for 30 days.')).toBeTruthy();
    expect(Object.values(be.state.invites).some((i) => i.name === 'Grandma June')).toBe(true);
    expectGrandparentSafe();
  });

  it('BETA-REPLY-12: there is no per-group "see each other\'s replies" switch any more', async () => {
    await renderApp(<GroupsScreen />, { user: 'chase' });
    await screen.findByText("Grandparents – Dad's side");
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(/see each other's replies/)).toBeNull();
    expectGrandparentSafe();
  });

  it('viewers are told plainly', async () => {
    await renderApp(<GroupsScreen />, { user: 'jo' });
    expect(await screen.findByText("You can't do that here.")).toBeTruthy();
  });
});
