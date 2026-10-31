// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// MSG-1, 3, 5, 8: the phone side of the messenger, end to end over the fake relay (docs/product/SPEC-MESSENGER.md).
// Chase and Alex are the parents (in every chat); Grandma Jo and Grandpa Earl are in "Grandparents – Dad's side";
// Nana Ruth is not, until MSG-5 adds her.
import { FakeBackend, FIXTURE } from '../../api/fake/FakeBackend';
import { ApiError } from '../../api/HearthApi';
import { fromBase64 } from '../../crypto/base64';
import { ChatClient, memoryStore, type ChatStore } from '../client';

const U = FIXTURE.users;
const G = FIXTURE.circles.dadSide.id;

function setup() {
  const be = FakeBackend.withFixture({ joIsMember: true });
  const client = (u: { id: string }, store: ChatStore = memoryStore()) => new ChatClient(be.clientFor(u.id), u.id, store);
  return { be, client };
}
const texts = (lines: { text: string }[]) => lines.map((l) => l.text);

describe('MSG messenger client (MLS over the relay)', () => {
  it('MSG-1: Chase starts the chat, lets Grandma Jo in, and they trade messages; the server never holds the words', async () => {
    const { be, client } = setup();
    const chase = client(U.chase), jo = client(U.jo);

    expect((await chase.open(G)).status).toBe('ready');
    expect((await jo.open(G)).status).toBe('waiting');   // her phone is published, not let in yet
    await chase.open(G);                                 // Chase's phone lets her in
    expect((await jo.open(G)).status).toBe('ready');

    await chase.send(G, 'Hi Bebar');
    const seen = await jo.open(G);
    expect(texts(seen.lines)).toEqual(['Hi Bebar']);
    expect(seen.lines[0]).toMatchObject({ sender_id: U.chase.id, name: 'Chase', mine: false });

    await jo.send(G, 'Hi back, sweetie');
    const back = await chase.open(G);
    expect(texts(back.lines)).toEqual(['Hi Bebar', 'Hi back, sweetie']);
    expect(back.lines.map((l) => l.mine)).toEqual([true, false]);

    const onServer = be.state.chat!.rows.map((r) => new TextDecoder().decode(fromBase64(r.body))).join('\n');
    expect(onServer).not.toContain('Hi Bebar');
    expect(onServer).not.toContain('sweetie');
  });

  it('MSG-1: history survives closing the app (same phone, new session)', async () => {
    const { client } = setup();
    const store = memoryStore();
    const chase = client(U.chase, store), jo = client(U.jo);
    await chase.open(G); await jo.open(G); await chase.open(G); await jo.open(G);
    await jo.send(G, 'Saved?');
    await chase.open(G);
    const again = client(U.chase, store);
    expect(texts((await again.open(G)).lines)).toEqual(['Saved?']);
    await again.send(G, 'Yes');
    expect(texts((await jo.open(G)).lines)).toEqual(['Saved?', 'Yes']);
  });

  it('MSG-3: someone removed from the group is cut off, and later messages are unreadable even from a copy of the rows', async () => {
    const { be, client } = setup();
    const chase = client(U.chase), jo = client(U.jo);
    await chase.open(G); await jo.open(G); await chase.open(G); await jo.open(G);
    await chase.send(G, 'Before');
    await jo.open(G);

    be.state.circleMembers = be.state.circleMembers.filter((m) => !(m.circle === G && m.user === U.jo.id));
    await chase.open(G);                                 // Chase's phone removes Jo at this key change
    await chase.send(G, 'After you left');

    await expect(jo.open(G)).rejects.toMatchObject({ code: 'P0002' });
    const leaked = be.state.chat!.rows.filter((r) => r.kind === 'message').at(-1)!;
    expect(await jo.peek(G, leaked.body)).toBeNull();
  });

  it('MSG-5: two phones letting someone in at the same moment never split the group', async () => {
    const { be, client } = setup();
    const chase = client(U.chase), alex = client(U.alex), ruth = client(U.ruth);
    await chase.open(G); await alex.open(G); await chase.open(G); await alex.open(G);
    expect((await alex.open(G)).status).toBe('ready');

    be.state.circleMembers.push({ circle: G, user: U.ruth.id });
    expect((await ruth.open(G)).status).toBe('waiting');
    const send = be.chatSend.bind(be);
    let lost = 0;
    jest.spyOn(be, 'chatSend').mockImplementation((...a) => {
      try { return send(...a); } catch (e) { if ((e as ApiError).code === '23505') lost++; throw e; }
    });
    await Promise.all([chase.open(G), alex.open(G)]);   // both try to add Ruth; one commit wins epoch N
    expect(lost).toBe(1);                               // the race really happened, and the loser retried cleanly
    expect((await ruth.open(G)).status).toBe('ready');

    await ruth.send(G, 'Thanks for having me');
    await alex.send(G, 'Welcome Ruth');
    expect(texts((await chase.open(G)).lines)).toEqual(['Thanks for having me', 'Welcome Ruth']);
    expect(texts((await ruth.open(G)).lines)).toEqual(['Thanks for having me', 'Welcome Ruth']);
    const commits = be.state.chat!.rows.filter((r) => r.kind === 'commit');
    expect(new Set(commits.map((r) => r.epoch)).size).toBe(commits.length);
  });

  it('MSG-8: a new phone replaces the old one at the next key change', async () => {
    const { client } = setup();
    const chase = client(U.chase), jo = client(U.jo);
    await chase.open(G); await jo.open(G); await chase.open(G); await jo.open(G);

    const joNewPhone = client(U.jo);
    expect((await joNewPhone.open(G)).status).toBe('waiting');
    await chase.open(G);
    expect((await joNewPhone.open(G)).status).toBe('ready');
    await chase.send(G, 'Got your new phone?');
    expect(texts((await joNewPhone.open(G)).lines)).toEqual(['Got your new phone?']);
  });

  it('MSG-2: someone outside the group gets "not found"', async () => {
    const { client } = setup();
    await expect(client(U.ruth).open(G)).rejects.toBeInstanceOf(ApiError);
  });
});
