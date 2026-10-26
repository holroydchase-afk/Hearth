// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
//
// The device side of the messenger. Each conversation is an MLS group (RFC 9420, ts-mls). The relay only passes
// opaque MLS bytes along: key changes ("commit"), welcomes and sealed messages. Group state, keys and history stay
// on this device, in the Store. Privacy: nothing here logs keys, message text or group state.
//
// open(conversation) does everything a visit needs, in order:
//   1. make sure this device has a signing key and enough key packages on the relay;
//   2. start the MLS group if nobody has, else wait for a welcome;
//   3. apply every new row (key changes in epoch order, messages into the local history);
//   4. reconcile with the roster: remove people who left or changed devices, add people who are new.
//      Two devices doing this at once race for the epoch; the loser gets EpochConflict, catches up and retries.
import {
  acceptAll, createApplicationMessage, createCommit, createGroup, decodeGroupState, decodeMlsMessage, defaultCapabilities,
  defaultLifetime, emptyPskIndex, encodeGroupState, encodeMlsMessage, generateKeyPackageWithKey, joinGroup, processMessage,
  type CiphersuiteImpl, type ClientState, type KeyPackage, type MLSMessage, type PrivateKeyPackage, type Proposal,
} from 'ts-mls';
import { defaultClientConfig } from 'ts-mls/clientConfig.js';
import { fromBase64, toBase64 } from './base64';
import { messengerCiphersuite, type RandomBytes } from './crypto';
import {
  EpochConflict, type Line, type Relay, type RelayRow, type Roster, type RosterMember, type Store, type View,
} from './types';

export interface MessengerOptions {
  relay: Relay;
  roster: Roster;
  /** Encrypted at rest by the product. Holds private keys and decrypted history. */
  store: Store;
  /** The signed-in user's id, as the relay and roster know it. */
  me: string;
  /** A secure random source (expo-crypto's getRandomValues, crypto.getRandomValues). Never Math.random. */
  random: RandomBytes;
  /** Prefix for storage keys. Default 'chat'; change it only for a fresh install. */
  keyPrefix?: string;
  /** Extra test for the relay's "epoch already taken" error, if it can't throw EpochConflict itself. */
  isEpochConflict?: (e: unknown) => boolean;
  /** Shown beside messages from someone no longer on the roster. */
  formerMemberName?: string;
}

/** A Store in memory only: for tests and for products that keep nothing between sessions. */
export function memoryStore(): Store {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => { m.set(k, v); },
    removeItem: async (k) => { m.delete(k); },
  };
}

const KEY_PACKAGE_BATCH = 10;
const KEY_PACKAGE_LOW = 3;
const FETCH_PAGE = 200;
const te = new TextEncoder();
const td = new TextDecoder();

interface StoredPackage { pub: string; init: string; hpke: string }
interface Identity { signKey: string; publicKey: string; packages: StoredPackage[] }
interface GroupCtx { state: ClientState | null; cursor: number; lines: Line[] }

const encMsg = (m: MLSMessage) => toBase64(encodeMlsMessage(m));
function decMsg(b64: string): MLSMessage | null {
  try {
    return decodeMlsMessage(fromBase64(b64), 0)?.[0] ?? null;
  } catch {
    return null;
  }
}

export class Messenger {
  private impl: Promise<CiphersuiteImpl>;
  private identity: Identity | null = null;
  private locks = new Map<string, Promise<unknown>>();
  private relay: Relay;
  private roster: Roster;
  private store: Store;
  private me: string;
  private prefix: string;
  private conflict: (e: unknown) => boolean;
  private formerName: string;

  constructor(o: MessengerOptions) {
    this.relay = o.relay;
    this.roster = o.roster;
    this.store = o.store;
    this.me = o.me;
    this.prefix = o.keyPrefix ?? 'chat';
    this.conflict = (e) => e instanceof EpochConflict || (o.isEpochConflict?.(e) ?? false);
    this.formerName = o.formerMemberName ?? 'Someone who left';
    this.impl = messengerCiphersuite(o.random);
  }

  open(conversation: string): Promise<View> {
    return this.locked(conversation, () => this.visit(conversation));
  }

  send(conversation: string, text: string): Promise<Line> {
    return this.locked(conversation, async () => {
      const body = text.trim();
      if (!body) throw new Error('empty message');
      const ctx = await this.load(conversation);
      if (!ctx.state) throw new Error('not in the chat yet');
      const impl = await this.impl;
      const out = await createApplicationMessage(ctx.state, te.encode(body), impl);
      ctx.state = out.newState;
      await this.save(conversation, ctx);   // the ratchet moved: keep it even if the send fails
      const id = await this.relay.send(conversation, 'message', Number(ctx.state.groupContext.epoch),
        encMsg({ privateMessage: out.privateMessage, wireformat: 'mls_private_message', version: 'mls10' }));
      const line: Line = { id, sender_id: this.me, name: 'You', text: body, at: new Date().toISOString(), mine: true };
      ctx.lines.push(line);
      await this.save(conversation, ctx);
      return line;
    });
  }

  /** Try to read one relayed body with this device's current keys, changing nothing. For tests and diagnostics. */
  async peek(conversation: string, body: string): Promise<string | null> {
    const ctx = await this.load(conversation);
    const msg = decMsg(body);
    if (!ctx.state || !msg || (msg.wireformat !== 'mls_private_message' && msg.wireformat !== 'mls_public_message')) return null;
    try {
      const r = await processMessage(msg, ctx.state, emptyPskIndex, acceptAll, await this.impl);
      return r.kind === 'applicationMessage' ? td.decode(r.message) : null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------------------------------------

  private async visit(conversation: string): Promise<View> {
    await this.ensureDevice();
    const ctx = await this.load(conversation);
    if (!ctx.state && (await this.relay.start(conversation))) {
      ctx.state = await this.newGroup(conversation);
      ctx.cursor = 0;
    }
    let roster = await this.roster.members(conversation);
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.sync(conversation, ctx, roster);
      if (!ctx.state) break;
      const r = await this.reconcile(conversation, ctx, roster);
      if (r !== 'conflict') break;
      roster = await this.roster.members(conversation);
    }
    await this.save(conversation, ctx);
    return { status: ctx.state ? 'ready' : 'waiting', lines: [...ctx.lines] };
  }

  private async sync(conversation: string, ctx: GroupCtx, roster: RosterMember[]): Promise<void> {
    const names = new Map(roster.map((r) => [r.user_id, r.name]));
    for (;;) {
      const rows = await this.relay.fetch(conversation, ctx.cursor, FETCH_PAGE);
      for (const row of rows) {
        if (!ctx.state) {
          if (row.kind === 'welcome' && (await this.tryJoin(ctx, row))) {
            // read on from the key change that let us in, so messages sent in our first epoch aren't skipped
            const from = await this.relay.fetch(conversation, 0, 500);
            const joinedFrom = from.find((r) => r.kind === 'commit' && r.epoch === Number(ctx.state!.groupContext.epoch) - 1);
            ctx.cursor = joinedFrom?.id ?? row.id;
            await this.save(conversation, ctx);
            return this.sync(conversation, ctx, roster);
          }
        } else {
          await this.apply(ctx, row, names);
        }
        ctx.cursor = row.id;
      }
      if (rows.length < FETCH_PAGE) return;
    }
  }

  private async apply(ctx: GroupCtx, row: RelayRow, names: Map<string, string>): Promise<void> {
    const state = ctx.state!;
    const epoch = Number(state.groupContext.epoch);
    if (row.kind === 'welcome') return;
    if (row.kind === 'commit') {
      if (row.epoch < epoch) return;   // ours, or one we already applied
      const msg = decMsg(row.body);
      if (row.epoch > epoch || !msg || (msg.wireformat !== 'mls_private_message' && msg.wireformat !== 'mls_public_message')) {
        return this.lost(ctx);
      }
      try {
        ctx.state = (await processMessage(msg, state, emptyPskIndex, acceptAll, await this.impl)).newState;
      } catch {
        return this.lost(ctx);
      }
      return;
    }
    if (row.sender_id === this.me) return;   // our own: MLS can't open it, and we kept a copy when sending
    const msg = decMsg(row.body);
    if (!msg || msg.wireformat !== 'mls_private_message') return;
    try {
      const r = await processMessage(msg, state, emptyPskIndex, acceptAll, await this.impl);
      ctx.state = r.newState;
      if (r.kind === 'applicationMessage') {
        const sender = row.sender_id ?? '';
        ctx.lines.push({ id: row.id, sender_id: sender, name: names.get(sender) ?? this.formerName, text: td.decode(r.message), at: row.created_at, mine: false });
      }
    } catch {
      // sent before we were let in, or with keys this device never had: unreadable by design
    }
  }

  /** This device fell out of step with the group: forget it, take a new signing key, and wait to be let back in. */
  private async lost(ctx: GroupCtx): Promise<void> {
    ctx.state = null;
    this.identity = null;
    await this.store.removeItem(this.idKey());
    await this.ensureDevice();
  }

  private async reconcile(conversation: string, ctx: GroupCtx, roster: RosterMember[]): Promise<'none' | 'committed' | 'conflict'> {
    const state = ctx.state!;
    const id = await this.ensureDevice();
    const want = new Map(roster.filter((r) => r.signature_key).map((r) => [r.user_id, r.signature_key!]));
    const people = new Set(roster.map((r) => r.user_id));
    const leaves: { index: number; user: string; key: string }[] = [];
    state.ratchetTree.forEach((n, i) => {
      if (n?.nodeType !== 'leaf' || n.leaf.credential.credentialType !== 'basic') return;
      leaves.push({ index: i / 2, user: td.decode(n.leaf.credential.identity), key: toBase64(n.leaf.signaturePublicKey) });
    });
    const removes = leaves.filter((l) => !(l.user === this.me && l.key === id.publicKey)
      && (!people.has(l.user) || (want.has(l.user) && want.get(l.user) !== l.key) || l.user === this.me));
    const adds = [...want.entries()].filter(([u, k]) => u !== this.me && !leaves.some((l) => l.user === u && l.key === k)).map(([u]) => u);
    if (!removes.length && !adds.length) return 'none';

    const impl = await this.impl;
    const proposals: Proposal[] = removes.map((l) => ({ proposalType: 'remove', remove: { removed: l.index } }));
    const added: string[] = [];
    for (const c of adds.length ? await this.relay.claim(conversation, adds) : []) {
      const kp = decMsg(c.key_package);
      if (kp?.wireformat !== 'mls_key_package') continue;
      const leaf = kp.keyPackage.leafNode;
      // only the device the roster names for this person (a mismatched package is skipped, never added)
      if (leaf.credential.credentialType !== 'basic' || td.decode(leaf.credential.identity) !== c.user_id
        || toBase64(leaf.signaturePublicKey) !== want.get(c.user_id)) continue;
      proposals.push({ proposalType: 'add', add: { keyPackage: kp.keyPackage } });
      added.push(c.user_id);
    }
    if (!proposals.length) return 'none';

    const result = await createCommit({ state, cipherSuite: impl }, { extraProposals: proposals, ratchetTreeExtension: true });
    try {
      await this.relay.send(conversation, 'commit', Number(state.groupContext.epoch), encMsg(result.commit));
    } catch (e) {
      if (this.conflict(e)) return 'conflict';
      throw e;
    }
    ctx.state = result.newState;
    await this.save(conversation, ctx);
    if (result.welcome) {
      const body = encMsg({ welcome: result.welcome, wireformat: 'mls_welcome', version: 'mls10' });
      for (const u of added) await this.relay.send(conversation, 'welcome', Number(state.groupContext.epoch), body, u);
    }
    return 'committed';
  }

  private async tryJoin(ctx: GroupCtx, row: RelayRow): Promise<boolean> {
    const msg = decMsg(row.body);
    if (msg?.wireformat !== 'mls_welcome') return false;
    const id = await this.ensureDevice();
    const impl = await this.impl;
    for (const p of id.packages) {
      const pub = decMsg(p.pub);
      if (pub?.wireformat !== 'mls_key_package') continue;
      try {
        ctx.state = await joinGroup(msg.welcome, pub.keyPackage, this.privateOf(p, id), emptyPskIndex, impl);
        id.packages = id.packages.filter((x) => x !== p);
        await this.store.setItem(this.idKey(), JSON.stringify(id));
        return true;
      } catch {
        // not for this package
      }
    }
    return false;
  }

  private async newGroup(conversation: string): Promise<ClientState> {
    const id = await this.ensureDevice();
    const { pub, priv } = await this.makePackage(id);
    return createGroup(te.encode(conversation), pub, priv, [], await this.impl);
  }

  // ---- this device's MLS identity ----

  private idKey = () => `${this.prefix}.identity.${this.me}`;

  private async ensureDevice(): Promise<Identity> {
    if (!this.identity) {
      const raw = await this.store.getItem(this.idKey());
      this.identity = raw ? (JSON.parse(raw) as Identity) : null;
    }
    let id = this.identity;
    let publish = false;
    if (!id) {
      const kp = await (await this.impl).signature.keygen();
      id = { signKey: toBase64(kp.signKey), publicKey: toBase64(kp.publicKey), packages: [] };
      publish = true;
    } else {
      publish = (await this.relay.keyPackageCount()) < KEY_PACKAGE_LOW;
    }
    if (publish) {
      const fresh: StoredPackage[] = [];
      for (let i = 0; i < KEY_PACKAGE_BATCH; i++) {
        const { pub, priv } = await this.makePackage(id);
        fresh.push({ pub: encMsg({ keyPackage: pub, wireformat: 'mls_key_package', version: 'mls10' }), init: toBase64(priv.initPrivateKey), hpke: toBase64(priv.hpkePrivateKey) });
      }
      await this.relay.publishDevice(id.publicKey, fresh.map((p) => p.pub));
      id.packages = [...id.packages, ...fresh].slice(-5 * KEY_PACKAGE_BATCH);
      await this.store.setItem(this.idKey(), JSON.stringify(id));
    }
    this.identity = id;
    return id;
  }

  private async makePackage(id: Identity): Promise<{ pub: KeyPackage; priv: PrivateKeyPackage }> {
    const r = await generateKeyPackageWithKey(
      { credentialType: 'basic', identity: te.encode(this.me) }, defaultCapabilities(), defaultLifetime, [],
      { signKey: fromBase64(id.signKey), publicKey: fromBase64(id.publicKey) }, await this.impl);
    return { pub: r.publicPackage, priv: r.privatePackage };
  }

  private privateOf(p: StoredPackage, id: Identity): PrivateKeyPackage {
    return { initPrivateKey: fromBase64(p.init), hpkePrivateKey: fromBase64(p.hpke), signaturePrivateKey: fromBase64(id.signKey) };
  }

  // ---- per-chat state on this device ----

  private groupKey = (conversation: string) => `${this.prefix}.group.${this.me}.${conversation}`;

  private async load(conversation: string): Promise<GroupCtx> {
    const raw = await this.store.getItem(this.groupKey(conversation));
    if (!raw) return { state: null, cursor: 0, lines: [] };
    const saved = JSON.parse(raw) as { state: string | null; cursor: number; lines: Line[] };
    let state: ClientState | null = null;
    if (saved.state) {
      const gs = decodeGroupState(fromBase64(saved.state), 0)?.[0];
      state = gs ? { ...gs, clientConfig: defaultClientConfig } : null;
    }
    return { state, cursor: saved.cursor, lines: saved.lines };
  }

  private async save(conversation: string, ctx: GroupCtx): Promise<void> {
    await this.store.setItem(this.groupKey(conversation), JSON.stringify({
      state: ctx.state ? toBase64(encodeGroupState(ctx.state)) : null, cursor: ctx.cursor, lines: ctx.lines,
    }));
  }

  private locked<T>(conversation: string, f: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(conversation) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(f);
    this.locks.set(conversation, next);
    return next;
  }
}
