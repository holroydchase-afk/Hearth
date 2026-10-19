// The phone side of the messenger (docs/product/SPEC-MESSENGER.md). Each chat is an MLS group (RFC 9420, ts-mls)
// whose people are the group's members plus the parents. The server only relays opaque MLS bytes (0015):
// key changes ("commit"), welcomes and sealed messages. Group state, keys and history stay on this phone,
// encrypted at rest (secureSessionStorage). Privacy: nothing here logs keys, message text or group state.
//
// open(circle) does everything a visit to Messages needs, in order:
//   1. make sure this phone has a signing key and enough key packages on the server;
//   2. start the MLS group if nobody has, else wait for a welcome;
//   3. apply every new row (key changes in epoch order, messages into the local history);
//   4. reconcile with the roster: remove people who left or changed phones, add people who are new (MSG-3, MSG-8).
//      Two phones doing this at once race for the epoch; the loser gets 23505, catches up and retries (MSG-5).
import {
  acceptAll, createApplicationMessage, createCommit, createGroup, decodeGroupState, decodeMlsMessage, defaultCapabilities,
  defaultLifetime, emptyPskIndex, encodeGroupState, encodeMlsMessage, generateKeyPackageWithKey, joinGroup, processMessage,
  type CiphersuiteImpl, type ClientState, type KeyPackage, type MLSMessage, type PrivateKeyPackage, type Proposal,
} from 'ts-mls';
import { defaultClientConfig } from 'ts-mls/clientConfig.js';
import type { HearthApi } from '../api/HearthApi';
import { isApiError } from '../api/HearthApi';
import type { ChatMember, ChatRow } from '../api/types';
import { fromBase64, toBase64 } from '../crypto/base64';
import { secureSessionStorage } from '../platform/secureSession';
import { hearthCiphersuite } from './mlsCrypto';

export interface ChatLine { id: number; sender_id: string; name: string; text: string; at: string; mine: boolean }
/** ready: in the group. waiting: this phone isn't let in yet (someone in the group has to open Messages). */
export type ChatStatus = 'ready' | 'waiting';
export interface ChatView { status: ChatStatus; lines: ChatLine[] }

export interface ChatStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export function memoryStore(): ChatStore {
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
interface GroupCtx { state: ClientState | null; cursor: number; lines: ChatLine[] }

const encMsg = (m: MLSMessage) => toBase64(encodeMlsMessage(m));
function decMsg(b64: string): MLSMessage | null {
  try {
    return decodeMlsMessage(fromBase64(b64), 0)?.[0] ?? null;
  } catch {
    return null;
  }
}

export class ChatClient {
  private impl: Promise<CiphersuiteImpl>;
  private identity: Identity | null = null;
  private locks = new Map<string, Promise<unknown>>();

  constructor(private api: HearthApi, private me: string, private store: ChatStore = secureSessionStorage) {
    this.impl = hearthCiphersuite();
  }

  open(circle: string): Promise<ChatView> {
    return this.locked(circle, () => this.visit(circle));
  }

  send(circle: string, text: string): Promise<ChatLine> {
    return this.locked(circle, async () => {
      const body = text.trim();
      if (!body) throw new Error('empty message');
      const ctx = await this.load(circle);
      if (!ctx.state) throw new Error('not in the chat yet');
      const impl = await this.impl;
      const out = await createApplicationMessage(ctx.state, te.encode(body), impl);
      ctx.state = out.newState;
      await this.save(circle, ctx);   // the ratchet moved: keep it even if the send fails
      const id = await this.api.chatSend(circle, 'message', Number(ctx.state.groupContext.epoch),
        encMsg({ privateMessage: out.privateMessage, wireformat: 'mls_private_message', version: 'mls10' }));
      const line: ChatLine = { id, sender_id: this.me, name: 'You', text: body, at: new Date().toISOString(), mine: true };
      ctx.lines.push(line);
      await this.save(circle, ctx);
      return line;
    });
  }

  /** Try to read one relayed body with this phone's current keys, changing nothing. For tests and diagnostics. */
  async peek(circle: string, body: string): Promise<string | null> {
    const ctx = await this.load(circle);
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

  private async visit(circle: string): Promise<ChatView> {
    await this.ensureDevice();
    const ctx = await this.load(circle);
    if (!ctx.state && (await this.api.chatStart(circle))) {
      ctx.state = await this.newGroup(circle);
      ctx.cursor = 0;
    }
    let roster = await this.api.chatRoster(circle);
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.sync(circle, ctx, roster);
      if (!ctx.state) break;
      const r = await this.reconcile(circle, ctx, roster);
      if (r !== 'conflict') break;
      roster = await this.api.chatRoster(circle);
    }
    await this.save(circle, ctx);
    return { status: ctx.state ? 'ready' : 'waiting', lines: [...ctx.lines] };
  }

  private async sync(circle: string, ctx: GroupCtx, roster: ChatMember[]): Promise<void> {
    const names = new Map(roster.map((r) => [r.user_id, r.name]));
    for (;;) {
      const rows = await this.api.chatFetch(circle, ctx.cursor, FETCH_PAGE);
      for (const row of rows) {
        if (!ctx.state) {
          if (row.kind === 'welcome' && (await this.tryJoin(ctx, row))) {
            // read on from the key change that let us in, so messages sent in our first epoch aren't skipped
            const from = await this.api.chatFetch(circle, 0, 500);
            const joinedFrom = from.find((r) => r.kind === 'commit' && r.epoch === Number(ctx.state!.groupContext.epoch) - 1);
            ctx.cursor = joinedFrom?.id ?? row.id;
            await this.save(circle, ctx);
            return this.sync(circle, ctx, roster);
          }
        } else {
          await this.apply(ctx, row, names);
        }
        ctx.cursor = row.id;
      }
      if (rows.length < FETCH_PAGE) return;
    }
  }

  private async apply(ctx: GroupCtx, row: ChatRow, names: Map<string, string>): Promise<void> {
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
        ctx.lines.push({ id: row.id, sender_id: sender, name: names.get(sender) ?? 'Someone who left', text: td.decode(r.message), at: row.created_at, mine: false });
      }
    } catch {
      // sent before we were let in, or with keys this phone never had: unreadable by design
    }
  }

  /** This phone fell out of step with the group: forget it, take a new signing key, and wait to be let back in. */
  private async lost(ctx: GroupCtx): Promise<void> {
    ctx.state = null;
    this.identity = null;
    await this.store.removeItem(this.idKey());
    await this.ensureDevice();
  }

  private async reconcile(circle: string, ctx: GroupCtx, roster: ChatMember[]): Promise<'none' | 'committed' | 'conflict'> {
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
    for (const c of adds.length ? await this.api.chatClaim(circle, adds) : []) {
      const kp = decMsg(c.key_package);
      if (kp?.wireformat !== 'mls_key_package') continue;
      const leaf = kp.keyPackage.leafNode;
      // only the phone the roster names for this person (a mismatched package is skipped, never added)
      if (leaf.credential.credentialType !== 'basic' || td.decode(leaf.credential.identity) !== c.user_id
        || toBase64(leaf.signaturePublicKey) !== want.get(c.user_id)) continue;
      proposals.push({ proposalType: 'add', add: { keyPackage: kp.keyPackage } });
      added.push(c.user_id);
    }
    if (!proposals.length) return 'none';

    const result = await createCommit({ state, cipherSuite: impl }, { extraProposals: proposals, ratchetTreeExtension: true });
    try {
      await this.api.chatSend(circle, 'commit', Number(state.groupContext.epoch), encMsg(result.commit));
    } catch (e) {
      if (isApiError(e) && e.code === '23505') return 'conflict';
      throw e;
    }
    ctx.state = result.newState;
    await this.save(circle, ctx);
    if (result.welcome) {
      const body = encMsg({ welcome: result.welcome, wireformat: 'mls_welcome', version: 'mls10' });
      for (const u of added) await this.api.chatSend(circle, 'welcome', Number(state.groupContext.epoch), body, u);
    }
    return 'committed';
  }

  private async tryJoin(ctx: GroupCtx, row: ChatRow): Promise<boolean> {
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

  private async newGroup(circle: string): Promise<ClientState> {
    const id = await this.ensureDevice();
    const { pub, priv } = await this.makePackage(id);
    return createGroup(te.encode(circle), pub, priv, [], await this.impl);
  }

  // ---- this phone's MLS identity ----

  private idKey = () => `chat.identity.${this.me}`;

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
      publish = (await this.api.chatKeyPackageCount()) < KEY_PACKAGE_LOW;
    }
    if (publish) {
      const fresh: StoredPackage[] = [];
      for (let i = 0; i < KEY_PACKAGE_BATCH; i++) {
        const { pub, priv } = await this.makePackage(id);
        fresh.push({ pub: encMsg({ keyPackage: pub, wireformat: 'mls_key_package', version: 'mls10' }), init: toBase64(priv.initPrivateKey), hpke: toBase64(priv.hpkePrivateKey) });
      }
      await this.api.chatPublishDevice(id.publicKey, fresh.map((p) => p.pub));
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

  // ---- per-chat state on this phone ----

  private groupKey = (circle: string) => `chat.group.${this.me}.${circle}`;

  private async load(circle: string): Promise<GroupCtx> {
    const raw = await this.store.getItem(this.groupKey(circle));
    if (!raw) return { state: null, cursor: 0, lines: [] };
    const saved = JSON.parse(raw) as { state: string | null; cursor: number; lines: ChatLine[] };
    let state: ClientState | null = null;
    if (saved.state) {
      const gs = decodeGroupState(fromBase64(saved.state), 0)?.[0];
      state = gs ? { ...gs, clientConfig: defaultClientConfig } : null;
    }
    return { state, cursor: saved.cursor, lines: saved.lines };
  }

  private async save(circle: string, ctx: GroupCtx): Promise<void> {
    await this.store.setItem(this.groupKey(circle), JSON.stringify({
      state: ctx.state ? toBase64(encodeGroupState(ctx.state)) : null, cursor: ctx.cursor, lines: ctx.lines,
    }));
  }

  private locked<T>(circle: string, f: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(circle) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(f);
    this.locks.set(circle, next);
    return next;
  }
}
