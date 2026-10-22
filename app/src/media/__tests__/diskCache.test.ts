// R8 / A3 (DEC-29): Photos opens instantly and offline. Encrypted photo files are kept on the phone; their keys
// live only in the keychain-backed store, never in plain storage. Kept files follow the feed and sign-out.
import { FakeBackend, FIXTURE } from '../../api/fake/FakeBackend';
import { toBase64 } from '../../crypto/base64';
import { memoryKV } from '../../platform/kv';
import { seedPost } from '../../test/seed';
import { MediaCache } from '../cache';
import { memoryMediaStore } from '../diskCache';

async function setup() {
  const be = FakeBackend.withFixture();
  const { id, plains } = await seedPost(be, { photos: 2 });
  const api = be.clientFor(FIXTURE.users.jo.id);
  const media = (await api.getFeed({ space: FIXTURE.space.id }))[0]!.media;
  const store = memoryMediaStore();
  const keys = memoryKV();
  const disk = { store, keys, userId: FIXTURE.users.jo.id };
  return { be, api, id, plains, media, store, keys, disk };
}

describe('A3 photos kept on the phone', () => {
  it('A3-1: after a cold start with no signal, a photo seen before still shows', async () => {
    const s = await setup();
    const m = s.media[0]!.media_id;
    const first = new MediaCache(s.api, { disk: s.disk });
    const uri = await first.uri(s.id, m, 'display');
    await first.flush();

    const offline = s.be.clientFor(FIXTURE.users.jo.id);
    jest.spyOn(offline, 'signView').mockRejectedValue(new Error('network down'));
    jest.spyOn(offline, 'getObject').mockRejectedValue(new Error('network down'));
    const second = new MediaCache(offline, { disk: s.disk });
    expect(await second.uri(s.id, m, 'display')).toBe(uri);
    expect(uri).toBe(`data:image/jpeg;base64,${toBase64(s.plains[0]!)}`);
  });

  it('A3-2: what is kept on disk is ciphertext, and no key is written anywhere but the keychain store', async () => {
    const s = await setup();
    const plainKV = memoryKV();
    const cache = new MediaCache(s.api, { disk: s.disk });
    await cache.uri(s.id, s.media[0]!.media_id, 'display');
    await cache.flush();
    const files = s.store.dump();
    expect(Object.keys(files).length).toBeGreaterThan(0);
    const plainB64 = Buffer.from(s.plains[0]!).toString('base64').slice(0, 40);
    for (const bytes of Object.values(files)) expect(Buffer.from(bytes).toString('base64')).not.toContain(plainB64);
    expect(Object.keys(plainKV.dump())).toHaveLength(0);
    expect(JSON.stringify(s.keys.dump())).toContain(s.media[0]!.media_id);
  });

  it('A3-3: files for photos no longer in my feed (deleted, or access taken away) are removed with their keys', async () => {
    const s = await setup();
    const [a, b] = [s.media[0]!.media_id, s.media[1]!.media_id];
    const cache = new MediaCache(s.api, { disk: s.disk });
    await cache.uri(s.id, a, 'thumb');
    await cache.uri(s.id, b, 'thumb');
    await cache.flush();
    await cache.prune(new Set([a]));
    expect(Object.keys(s.store.dump()).some((k) => k.startsWith(b))).toBe(false);
    expect(JSON.stringify(s.keys.dump())).not.toContain(b);
    expect(Object.keys(s.store.dump()).some((k) => k.startsWith(a))).toBe(true);
  });

  it('A3-4: signing out wipes every kept file and key', async () => {
    const s = await setup();
    const cache = new MediaCache(s.api, { disk: s.disk });
    await cache.uri(s.id, s.media[0]!.media_id, 'display');
    await cache.flush();
    await cache.clearDisk();
    expect(s.store.dump()).toEqual({});
    expect(JSON.stringify(s.keys.dump())).not.toContain(s.media[0]!.media_id);
  });

  it('A3-5: a damaged kept file is ignored and fetched again', async () => {
    const s = await setup();
    const m = s.media[0]!.media_id;
    const first = new MediaCache(s.api, { disk: s.disk });
    const uri = await first.uri(s.id, m, 'display');
    await first.flush();
    for (const k of Object.keys(s.store.dump())) await s.store.write(k, new Uint8Array([1, 2, 3]));
    const second = new MediaCache(s.api, { disk: s.disk });
    expect(await second.uri(s.id, m, 'display')).toBe(uri);
  });
});
