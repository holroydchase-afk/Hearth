// Viewing media: GET sign-media (10-minute URLs + per-item key), fetch ciphertext, decrypt in
// memory, hand <Image> a data: URI. Decrypted bytes never touch disk except "Save to my phone".
import { ApiError, type HearthApi, type ViewGrant, type ViewGrantItem } from '../api/HearthApi';
import { toBase64 } from '../crypto/base64';
import { decryptMedia } from '../crypto/media';

const MARGIN_MS = 60_000;

export class MediaCache {
  private grants = new Map<string, { at: Promise<ViewGrant>; expiresAt: number }>();
  private uris = new Map<string, Promise<string>>();
  private readonly now: () => number;
  private readonly max: number;

  constructor(private api: HearthApi, o: { now?: () => number; maxEntries?: number } = {}) {
    this.now = o.now ?? Date.now;
    this.max = o.maxEntries ?? 60;
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
    const it = await this.item(postId, mediaId);
    const cipher = await this.api.getObject(which === 'thumb' ? it.thumb_url : it.display_url);
    return { bytes: decryptMedia(cipher, it.dek), mime: which === 'thumb' ? 'image/jpeg' : it.mime_type };
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
