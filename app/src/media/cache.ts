// Viewing media: GET sign-media (10-minute URLs + per-item key), fetch ciphertext, decrypt in
// memory, hand <Image> a data: URI. Decrypted bytes never touch disk except "Save to my phone".
// A3 (DEC-29): with `disk`, the ciphertext is also kept on the phone and its key in the keychain-backed
// store, so a photo seen before opens instantly and offline. prune() follows the feed; clearDisk() runs at sign-out.
import { ApiError, type HearthApi, type ViewGrant, type ViewGrantItem } from '../api/HearthApi';
import { toBase64 } from '../crypto/base64';
import { decryptMediaAsync } from '../crypto/media';
import type { KV } from '../platform/kv';
import type { MediaStore } from './diskCache';

const MARGIN_MS = 60_000;

export interface DiskOptions {
  store: MediaStore;
  /** Keychain-backed (platform/mediaStore.ts). Never the plain app storage. */
  keys: KV;
  userId: string;
  /** Kept files, oldest dropped first. */
  maxFiles?: number;
}
type KeyEntry = { dek: string; mime: string; at: number };

export class MediaCache {
  private grants = new Map<string, { at: Promise<ViewGrant>; expiresAt: number }>();
  private uris = new Map<string, Promise<string>>();
  private readonly now: () => number;
  private readonly max: number;
  private readonly disk: DiskOptions | null;
  private keyMap: Promise<Record<string, KeyEntry>> | null = null;
  /** Disk writes run one after another; flush() waits for them. */
  private chain: Promise<void> = Promise.resolve();

  constructor(private api: HearthApi, o: { now?: () => number; maxEntries?: number; disk?: DiskOptions | null } = {}) {
    this.now = o.now ?? Date.now;
    this.max = o.maxEntries ?? 60;
    this.disk = o.disk ?? null;
  }

  private get keysName(): string {
    return `hearth.mediaKeys.v1.${this.disk!.userId}`;
  }

  private keys(): Promise<Record<string, KeyEntry>> {
    this.keyMap ??= this.disk!.keys.getItem(this.keysName)
      .then((raw) => (raw ? (JSON.parse(raw) as Record<string, KeyEntry>) : {}))
      .catch(() => ({}));
    return this.keyMap;
  }

  private queue(fn: () => Promise<void>): void {
    this.chain = this.chain.then(fn).catch(() => {});
  }

  /** Wait for kept-file writes (tests, sign-out). */
  async flush(): Promise<void> {
    let seen: Promise<void>;
    do {
      seen = this.chain;
      await seen;
    } while (seen !== this.chain); // a task may queue another (persistKeys)
  }

  private async fromDisk(name: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
    if (!this.disk) return null;
    try {
      const k = (await this.keys())[name];
      if (!k) return null;
      const cipher = await this.disk.store.read(name);
      if (!cipher) return null;
      return { bytes: await decryptMediaAsync(cipher, k.dek), mime: k.mime };
    } catch {
      return null; // damaged or stale: fetch it again
    }
  }

  private keep(name: string, cipher: Uint8Array, dek: string, mime: string): void {
    const d = this.disk;
    if (!d) return;
    this.queue(async () => {
      const map = await this.keys();
      await d.store.write(name, cipher);
      map[name] = { dek, mime, at: this.now() };
      const names = Object.keys(map).sort((a, b) => map[a]!.at - map[b]!.at);
      for (const old of names.slice(0, Math.max(0, names.length - (d.maxFiles ?? 400)))) {
        delete map[old];
        await d.store.remove(old);
      }
      this.persistKeys(); // queued behind any keeps already waiting, so one write covers them all
    });
  }

  private persistPending = false;
  /** One keychain-store write for a burst of kept files (a scroll keeps many at once). */
  private persistKeys(): void {
    const d = this.disk;
    if (!d || this.persistPending) return;
    this.persistPending = true;
    this.queue(async () => {
      this.persistPending = false;
      await d.keys.setItem(this.keysName, JSON.stringify(await this.keys()));
    });
  }

  /** Keep only files for photos still in my feed (deleted posts and lost access go). */
  prune(keepMediaIds: Set<string>): Promise<void> {
    const d = this.disk;
    if (!d) return Promise.resolve();
    this.queue(async () => {
      const map = await this.keys();
      for (const name of new Set([...Object.keys(map), ...(await d.store.list())])) {
        if (keepMediaIds.has(name.split('.')[0]!)) continue;
        delete map[name];
        await d.store.remove(name);
      }
      await d.keys.setItem(this.keysName, JSON.stringify(map));
    });
    return this.flush();
  }

  /** Sign-out: every kept file and key goes. */
  clearDisk(): Promise<void> {
    const d = this.disk;
    if (!d) return Promise.resolve();
    this.queue(async () => {
      await d.store.clear();
      await d.keys.removeItem(this.keysName);
      this.keyMap = Promise.resolve({});
    });
    return this.flush();
  }

  private grant(postId: string): Promise<ViewGrant> {
    const g = this.grants.get(postId);
    if (g && g.expiresAt > this.now()) return g.at;
    const started = this.now();
    const at = this.api.signView(postId);
    this.grants.set(postId, { at, expiresAt: started + 10 * 60 * 1000 - MARGIN_MS });
    at.then((v) => this.grants.set(postId, { at, expiresAt: started + v.expires_in * 1000 - MARGIN_MS }))
      .catch(() => this.grants.delete(postId));
    return at;
  }

  private async item(postId: string, mediaId: string): Promise<ViewGrantItem> {
    const g = await this.grant(postId);
    const it = g.items.find((i) => i.id === mediaId);
    if (!it) throw new ApiError('P0002');
    return it;
  }

  private async plain(postId: string, mediaId: string, which: 'thumb' | 'display'): Promise<{ bytes: Uint8Array; mime: string }> {
    const name = `${mediaId}.${which}`;
    const kept = await this.fromDisk(name);
    if (kept) return kept;
    const it = await this.item(postId, mediaId);
    const cipher = await this.api.getObject(which === 'thumb' ? it.thumb_url : it.display_url);
    const mime = which === 'thumb' ? 'image/jpeg' : it.mime_type;
    const bytes = await decryptMediaAsync(cipher, it.dek);
    this.keep(name, cipher, it.dek, mime);
    return { bytes, mime };
  }

  uri(postId: string, mediaId: string, which: 'thumb' | 'display'): Promise<string> {
    const key = `${mediaId}:${which}`;
    const hit = this.uris.get(key);
    if (hit) return hit;
    const p = this.plain(postId, mediaId, which).then(({ bytes, mime }) => `data:${mime};base64,${toBase64(bytes)}`);
    p.catch(() => this.uris.delete(key));
    if (this.max > 0) {
      this.uris.set(key, p);
      while (this.uris.size > this.max) this.uris.delete(this.uris.keys().next().value!);
    }
    return p;
  }

  /** Plaintext display bytes, for "Save to my phone". */
  bytes(postId: string, mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
    return this.plain(postId, mediaId, 'display');
  }

  /** Warm the next photos (BETA-SEE-2 / app-engineer rule 4). */
  prefetch(postId: string, mediaIds: string[]): void {
    for (const m of mediaIds) this.uri(postId, m, 'display').catch(() => {});
  }
}
