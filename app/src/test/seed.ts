// Test helpers: put real (encrypted) media into a FakeBackend the same way the app does.
import type { FakeBackend } from '../api/fake/FakeBackend';
import { FIXTURE } from '../api/fake/FakeBackend';
import { encryptMedia, encryptedSize } from '../crypto/media';
import { uuid } from '../crypto/random';

export const fakeJpegBytes = (seed: number, n = 600) => {
  const b = new Uint8Array(n).map((_, i) => (i * seed + 1) & 0xff);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff;
  return b;
};

export async function seedPost(be: FakeBackend, opts: { author?: string; caption?: string; circles?: string[]; photos?: number; takenAt?: string | null } = {}) {
  const api = be.clientFor(opts.author ?? FIXTURE.users.chase.id);
  const id = await api.createPost({ clientId: uuid(), space: FIXTURE.space.id, caption: opts.caption ?? 'Mia at the park', circleIds: opts.circles ?? [FIXTURE.circles.dadSide.id], takenAt: opts.takenAt ?? null });
  const n = opts.photos ?? 1;
  const plains: Uint8Array[] = [];
  if (n > 0) {
    const items = Array.from({ length: n }, (_, i) => {
      const d = fakeJpegBytes(i + 3);
      plains.push(d);
      return { kind: 'photo' as const, mime_type: 'image/jpeg', width: 2048, height: 1536, duration_ms: null, byte_size: encryptedSize(d.length), thumb_byte_size: encryptedSize(100), exif_stripped: true };
    });
    const g = await api.signUpload(id, items);
    for (const it of g.items) {
      await api.putObject(it.display_put_url, encryptMedia(plains[it.item_index]!, it.dek), it.required_headers);
      await api.putObject(it.thumb_put_url, encryptMedia(fakeJpegBytes(99, 100), it.dek), it.required_headers);
    }
    await api.finalizeMedia(g.items.map((i) => i.media_id));
  }
  await api.publishPost(id);
  return { id, plains };
}
