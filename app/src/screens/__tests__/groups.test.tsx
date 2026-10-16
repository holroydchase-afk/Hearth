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
    fireEvent.press(await screen.findByRole('button', { name: 'Make the invite' }));
    expect(await screen.findByText('Works for 30 days.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Text the invite' }));
    await waitFor(() => expect(deps.openUrl).toHaveBeenCalledWith(expect.stringMatching(/^sms:.*body=Hi.*hearth\.family%2Fjoin%2F/)));
    expect(decodeURIComponent((deps.openUrl as jest.Mock).mock.calls[0][0])).toMatch(/type this code: [A-Z0-9]{5} [A-Z0-9]{5}$/); // BETA-JOIN-8
  });

  it('JOIN-1: the invite carries the name the family uses, so she types nothing', async () => {
    const be = FakeBackend.withFixture();
    await renderApp(<GroupsScreen />, { be, user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: "Invite someone to Grandparents – Dad's side" }));
    fireEvent.changeText(screen.getByLabelText('Their name, the way your family says it'), 'Grandma June');
    fireEvent.press(screen.getByRole('button', { name: 'Make the invite' }));
    expect(await screen.findByText('Works for 30 days.')).toBeTruthy();
    expect(Object.values(be.state.invites).some((i) => i.name === 'Grandma June')).toBe(true);
    expectGrandparentSafe();
  });

  it('viewers are told plainly', async () => {
    await renderApp(<GroupsScreen />, { user: 'jo' });
    expect(await screen.findByText("You can't do that here.")).toBeTruthy();
  });
});
