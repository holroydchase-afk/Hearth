// MSG-1, MSG-9 (screen half): Messages opens in place from a labeled button at the top of Photos, like Events.
// Grandma Jo (a relative) sees chats titled by their people (AUD-14), waits to be let in, then writes and reads.
// No read receipts, typing dots or "seen" anywhere (A2).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FakeBackend, FIXTURE } from '../../api/fake/FakeBackend';
import { ChatClient, memoryStore } from '../../messenger/client';
import { expectGrandparentSafe, renderApp, screenWords } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';

const G = FIXTURE.circles.dadSide.id;
const slow = { timeout: 5000 };

describe('MSG Messages screen', () => {
  it('MSG-1: Jo opens Messages, waits to be let in, then writes to Chase and reads his reply', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    const chase = new ChatClient(be.clientFor(FIXTURE.users.chase.id), FIXTURE.users.chase.id, memoryStore());
    await chase.open(G);                       // Chase started the chat earlier

    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Messages' }));
    expect(await screen.findByRole('header', { name: 'Messages' })).toBeTruthy();
    // AUD-14: titled by its people, never the group's name
    expect(screen.queryByText(/Grandparents/)).toBeNull();
    fireEvent.press(await screen.findByRole('button', { name: 'Open the chat with Alex, Chase and Grandpa Earl' }));
    expect(await screen.findByText(/someone else in this chat opens Messages/, {}, slow)).toBeTruthy();

    await act(async () => { await chase.open(G); });   // Chase's phone lets her in
    fireEvent.press(screen.getByRole('button', { name: 'Check for new messages' }));
    const box = await screen.findByLabelText('Your message', {}, slow);
    fireEvent.changeText(box, 'Hi Chase');
    fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Hi Chase', {}, slow)).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();

    let got: string[] = [];
    await act(async () => {
      got = (await chase.open(G)).lines.map((l) => l.text);
      await chase.send(G, 'Hi Bebar');
    });
    expect(got).toEqual(['Hi Chase']);
    fireEvent.press(screen.getByRole('button', { name: 'Check for new messages' }));
    expect(await screen.findByText('Hi Bebar', {}, slow)).toBeTruthy();
    expect(screen.getAllByText('Chase').length).toBeGreaterThan(0);

    expect(screen.getByText(/Only the people in this chat can read it/)).toBeTruthy();
    expect(screenWords()).not.toMatch(/\b(seen|read by|typing|delivered|last active)\b/i);
    expectGrandparentSafe();

    fireEvent.press(screen.getByRole('button', { name: 'Back to all messages' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Back to Photos' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Messages' })).toBeTruthy());
  });

  it('MSG-1: a parent sees the group\'s own name', async () => {
    await renderApp(<PhotosScreen />, { user: 'chase', fixture: { joIsMember: true } });
    fireEvent.press(await screen.findByRole('button', { name: 'Messages' }));
    expect(await screen.findByRole('button', { name: "Open the chat Grandparents – Dad's side" })).toBeTruthy();
  });

  // RR-18 (recruiter-ready re-check, Oct 22): a chat counts the group plus the family's parents (REPLY-10), so
  // "Grandparents – Dad's side, 4 people" in Messages sat beside "3 people" in Groups and Share with no reason given.
  it('RR-18 the Messages list says parents are in every chat, so its people count matches what the group shows', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: 'Messages' }));
    expect(await screen.findByText(/Parents are in every chat\./)).toBeTruthy();
    expectGrandparentSafe();
  });
});
