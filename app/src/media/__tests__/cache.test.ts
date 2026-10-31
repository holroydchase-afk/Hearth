// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import { FakeBackend, FIXTURE } from '../../api/fake/FakeBackend';
import { toBase64 } from '../../crypto/base64';
import { seedPost } from '../../test/seed';
import { MediaCache } from '../cache';

describe('MediaCache: fetch ciphertext, decrypt in memory (BETA-SHARE-3 client side)', () => {
  it('returns a data URI of the decrypted photo and reuses the 10-minute grant', async () => {
    const be = FakeBackend.withFixture();
    const { id, plains } = await seedPost(be, { photos: 2 });
    const api = be.clientFor(FIXTURE.users.jo.id);
    const spy = jest.spyOn(api, 'signView');
    const cache = new MediaCache(api);
    const feed = await api.getFeed({ space: FIXTURE.space.id });
    const [m0, m1] = feed[0]!.media;
    expect(await cache.uri(id, m0!.media_id, 'display')).toBe(`data:image/jpeg;base64,${toBase64(plains[0]!)}`);
    expect(await cache.uri(id, m1!.media_id, 'display')).toBe(`data:image/jpeg;base64,${toBase64(plains[1]!)}`);
    expect(await cache.uri(id, m0!.media_id, 'thumb')).toMatch(/^data:image\/jpeg;base64,/);
    expect(spy).toHaveBeenCalledTimes(1);
    const saved = await cache.bytes(id, m1!.media_id);
    expect(Buffer.from(saved.bytes)).toEqual(Buffer.from(plains[1]!));
  });

  it('someone outside the audience gets P0002', async () => {
    const be = FakeBackend.withFixture();
    const { id } = await seedPost(be);
    const media = (await be.clientFor(FIXTURE.users.jo.id).getFeed({ space: FIXTURE.space.id }))[0]!.media[0]!;
    const cache = new MediaCache(be.clientFor(FIXTURE.users.ruth.id));
    await expect(cache.uri(id, media.media_id, 'display')).rejects.toMatchObject({ code: 'P0002' });
  });

  it('re-signs after the grant is close to expiry', async () => {
    const be = FakeBackend.withFixture();
    const { id } = await seedPost(be);
    const api = be.clientFor(FIXTURE.users.jo.id);
    const spy = jest.spyOn(api, 'signView');
    let now = 0;
    const cache = new MediaCache(api, { now: () => now, maxEntries: 0 });
    const media = (await api.getFeed({ space: FIXTURE.space.id }))[0]!.media[0]!;
    await cache.uri(id, media.media_id, 'display');
    now += 9.5 * 60 * 1000;
    await cache.uri(id, media.media_id, 'display');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
