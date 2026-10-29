// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
//
// PKG-1..6: the engine against in-memory TEST FAKES of the three interfaces, with no product in sight. The fake
// relay keeps the rules relay/supabase.sql enforces: members only, rows since you joined, welcomes only to their
// recipient, one commit per epoch.
import { randomBytes as nodeRandom } from 'crypto';
import {
  EpochConflict, memoryStore, Messenger, type ClaimedKeyPackage, type Relay, type RelayRow, type RelayRowKind,
  type Roster, type RosterMember, type Store,
} from '../index';

const random = (n: number) => new Uint8Array(nodeRandom(n));
const C = 'crew-7';   // one conversation, named the way a product other than Hearth might name it

/** TEST FAKE: one in-memory relay shared by every device, plus a roster the test edits directly. */
class FakeServer {
  members = new Map<string, { name: string; since: number }>();   // user -> joined at (row counter)
  devices = new Map<string, string>();
  packages: { user: string; pkg: string }[] = [];
  started = new Set<string>();
  rows: (RelayRow & { recipient: string | null; seq: number })[] = [];
  seq = 0;

  add(user: string, name: string) { this.members.set(user, { name, since: this.seq }); }
  private need(user: string, conv: string) {
    if (conv !== C || !this.members.has(user)) throw Object.assign(new Error('not found'), { code: 'P0002' });
    return this.members.get(user)!;
  }

  as(user: string): Relay & Roster {
    return {
      publishDevice: async (key, pkgs) => {
        if (this.devices.get(user) !== key) this.packages = this.packages.filter((p) => p.user !== user);
        this.devices.set(user, key);
        this.packages.push(...pkgs.map((pkg) => ({ user, pkg })));
      },
      keyPackageCount: async () => this.packages.filter((p) => p.user === user).length,
      start: async (conv) => {
        this.need(user, conv);
        if (this.started.has(conv)) return false;
        this.started.add(conv);
        return true;
      },
      claim: async (conv, users) => {
        this.need(user, conv);
        const out: ClaimedKeyPackage[] = [];
        for (const u of users) {
          if (!this.members.has(u)) continue;
          const i = this.packages.findIndex((p) => p.user === u);
          if (i >= 0) out.push({ user_id: u, key_package: this.packages.splice(i, 1)[0]!.pkg });
        }
        return out;
      },
      send: async (conv, kind: RelayRowKind, epoch, body, recipient) => {
        this.need(user, conv);
        if (kind === 'commit' && this.rows.some((r) => r.kind === 'commit' && r.epoch === epoch)) throw new EpochConflict();
        const id = this.rows.length + 1;
        this.rows.push({ id, sender_id: user, kind, epoch, body, created_at: new Date().toISOString(), recipient: recipient ?? null, seq: ++this.seq });
        return id;
      },
      fetch: async (conv, after, limit) => {
        const { since } = this.need(user, conv);
        return this.rows
          .filter((r) => r.id > after && r.seq > since && (r.recipient === null || r.recipient === user))
          .slice(0, limit)
          .map(({ recipient: _r, seq: _s, ...row }) => row);
      },
      members: async (conv) => {
        this.need(user, conv);
        return [...this.members].map(([u, m]): RosterMember => ({ user_id: u, name: m.name, signature_key: this.devices.get(u) ?? null }));
      },
    };
  }
}

function setup() {
  const server = new FakeServer();
  server.add('ana', 'Ana');
  server.add('ben', 'Ben');
  const device = (user: string, store: Store = memoryStore()) => {
    const r = server.as(user);
    return new Messenger({ relay: r, roster: r, store, me: user, random });
  };
  return { server, device };
}
const texts = (lines: { text: string }[]) => lines.map((l) => l.text);

describe('PKG @holroyd/messenger engine (test fakes, no product)', () => {
  it('PKG-1: two people trade messages; the relay never holds the words', async () => {
    const { server, device } = setup();
    const ana = device('ana'), ben = device('ben');
    expect((await ana.open(C)).status).toBe('ready');
    expect((await ben.open(C)).status).toBe('waiting');
    await ana.open(C);
    expect((await ben.open(C)).status).toBe('ready');

    await ana.send(C, 'Shift starts at 7');
    expect((await ben.open(C)).lines[0]).toMatchObject({ text: 'Shift starts at 7', name: 'Ana', mine: false });
    await ben.send(C, 'On my way');
    expect(texts((await ana.open(C)).lines)).toEqual(['Shift starts at 7', 'On my way']);

    const onServer = server.rows.map((r) => Buffer.from(r.body, 'base64').toString('latin1')).join('\n');
    expect(onServer).not.toContain('Shift starts');
    expect(onServer).not.toContain('On my way');
  });

  it('PKG-2: someone taken off the roster is cut off and cannot read later rows', async () => {
    const { server, device } = setup();
    const ana = device('ana'), ben = device('ben');
    await ana.open(C); await ben.open(C); await ana.open(C); await ben.open(C);
    server.members.delete('ben');
    await ana.open(C);
    await ana.send(C, 'After Ben left');
    await expect(ben.open(C)).rejects.toMatchObject({ code: 'P0002' });
    expect(await ben.peek(C, server.rows.at(-1)!.body)).toBeNull();
  });

  it('PKG-3: two devices adding someone at once never split the group', async () => {
    const { server, device } = setup();
    const ana = device('ana'), ben = device('ben'), cy = device('cy');
    await ana.open(C); await ben.open(C); await ana.open(C); await ben.open(C);
    server.add('cy', 'Cy');
    expect((await cy.open(C)).status).toBe('waiting');
    await Promise.all([ana.open(C), ben.open(C)]);
    expect((await cy.open(C)).status).toBe('ready');
    await cy.send(C, 'Thanks');
    expect(texts((await ana.open(C)).lines)).toEqual(['Thanks']);
    expect(texts((await ben.open(C)).lines)).toEqual(['Thanks']);
    const commits = server.rows.filter((r) => r.kind === 'commit');
    expect(new Set(commits.map((r) => r.epoch)).size).toBe(commits.length);
  });

  it('PKG-4: a new device replaces the old one at the next key change', async () => {
    const { device } = setup();
    const ana = device('ana'), ben = device('ben');
    await ana.open(C); await ben.open(C); await ana.open(C); await ben.open(C);
    const benNew = device('ben');
    expect((await benNew.open(C)).status).toBe('waiting');
    await ana.open(C);
    await ana.send(C, 'New phone?');
    expect(texts((await benNew.open(C)).lines)).toEqual(['New phone?']);
  });

  it('PKG-5: history survives a restart from the same store, under the chosen key prefix', async () => {
    const { server, device } = setup();
    const store = memoryStore();
    const ana = device('ana', store), ben = device('ben');
    await ana.open(C); await ben.open(C); await ana.open(C); await ben.open(C);
    await ben.send(C, 'Saved?');
    await ana.open(C);
    const again = device('ana', store);
    expect(texts((await again.open(C)).lines)).toEqual(['Saved?']);
    expect(await store.getItem(`chat.group.ana.${C}`)).not.toBeNull();

    const r = server.as('ana');
    const custom = memoryStore();
    await new Messenger({ relay: r, roster: r, store: custom, me: 'ana', random, keyPrefix: 'crew' }).open(C);
    expect(await custom.getItem('crew.identity.ana')).not.toBeNull();
  });

  it('PKG-6: a relay error that means "epoch taken" can be recognised without EpochConflict', async () => {
    const { server, device } = setup();
    const raw = server.as('ben');
    let taken = 0;
    const coded: Relay = {
      ...raw,
      send: (...a) => raw.send(...a).catch((e) => { if (e instanceof EpochConflict) { taken++; throw { code: 'taken' }; } throw e; }),
    };
    const ana = device('ana');
    const ben = new Messenger({
      relay: coded, roster: raw, store: memoryStore(), me: 'ben', random, isEpochConflict: (e) => (e as { code?: string }).code === 'taken',
    });
    await ana.open(C); await ben.open(C); await ana.open(C); await ben.open(C);
    server.add('cy', 'Cy');
    const cy = device('cy');
    await cy.open(C);
    // Ben goes first and loses the race: Ana commits the epoch Ben is about to use
    const realSend = raw.send;
    raw.send = async (...a) => { if (a[1] === 'commit') await ana.open(C); return realSend(...a); };
    await ben.open(C);
    raw.send = realSend;
    expect(taken).toBe(1);
    expect((await cy.open(C)).status).toBe('ready');
    await ben.send(C, 'Still one group');
    expect(texts((await cy.open(C)).lines)).toEqual(['Still one group']);
  });
});
