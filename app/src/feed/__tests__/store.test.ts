// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Feed cache with keyset pagination + optimistic hearts and comments (BETA-REPLY-1/2, B6, SEE-2).
import { ApiError, type HearthApi, type ReactionState } from '../../api/HearthApi';
import { FakeBackend, FIXTURE } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import { memoryKV } from '../../platform/kv';
import { FeedStore } from '../store';

const SPACE = FIXTURE.space.id;
const { chase, jo, ruth } = FIXTURE.users;

async function seed(be: FakeBackend, n: number, circle = FIXTURE.circles.dadSide.id) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push((await seedPost(be, { caption: `post ${i}`, circles: [circle] })).id);
  return ids;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

const make = (api: HearthApi, kv = memoryKV(), userId = jo.id, pageSize = 5) => new FeedStore({ api, kv, userId, spaceId: SPACE, pageSize });

describe('FeedStore pagination', () => {
  it('loads newest first and pages with the (published_at, id) keyset, no duplicates', async () => {
    const be = FakeBackend.withFixture();
    const ids = await seed(be, 12);
    const api = be.clientFor(jo.id);
    const spy = jest.spyOn(api, 'getFeed');
    const s = make(api);
    await s.refresh();
    expect(s.getState().posts.map((p) => p.post_id)).toEqual(ids.slice().reverse().slice(0, 5));
    expect(s.getState().hasMore).toBe(true);
    await s.loadMore();
    const last5 = s.getState().posts[4]!;
    expect(spy).toHaveBeenLastCalledWith({ space: SPACE, beforeTs: last5.published_at, beforeId: last5.post_id, limit: 5 });
    await s.loadMore();
    expect(s.getState().posts.map((p) => p.post_id)).toEqual(ids.slice().reverse());
    expect(s.getState().hasMore).toBe(false);
  });

  it('refresh drops posts that were deleted on the server', async () => {
    const be = FakeBackend.withFixture();
    const [a] = await seed(be, 2);
    const s = make(be.clientFor(jo.id));
    await s.refresh();
    await be.clientFor(chase.id).deletePost(a!);
    await s.refresh();
    expect(s.getState().posts.map((p) => p.post_id)).not.toContain(a);
  });
});

describe('BETA-SEE-2 cached first page', () => {
  it('shows the cached photos instantly on reopen, before the network answers', async () => {
    const be = FakeBackend.withFixture();
    await seed(be, 3);
    const kv = memoryKV();
    const s1 = make(be.clientFor(jo.id), kv);
    await s1.refresh();
    const slow = be.clientFor(jo.id);
    jest.spyOn(slow, 'getFeed').mockImplementation(() => new Promise(() => {}));
    const s2 = make(slow, kv);
    await s2.hydrate();
    expect(s2.getState().posts).toHaveLength(3);
  });

  it("is per user: Nana Ruth never sees Grandma Jo's cached photos on a shared phone", async () => {
    const be = FakeBackend.withFixture();
    await seed(be, 3);
    const kv = memoryKV();
    await make(be.clientFor(jo.id), kv, jo.id).refresh();
    const s = make(be.clientFor(ruth.id), kv, ruth.id);
    await s.hydrate();
    expect(s.getState().posts).toHaveLength(0);
  });
});

// REACT-1 (0017): toggleHeart is Love through set_reaction, so these watch setReaction.
describe('BETA-REPLY-1 optimistic hearts', () => {
  it('flips at once, then matches the server', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const api = be.clientFor(jo.id);
    const d = deferred<ReactionState>();
    jest.spyOn(api, 'setReaction').mockImplementationOnce(() => d.promise);
    const s = make(api);
    await s.refresh();
    const p = s.toggleHeart(id!);
    expect(s.getState().posts[0]).toMatchObject({ i_hearted: true, heart_count: 1 });
    d.resolve({ my_reaction: '❤️', heart_count: 4, counts: { '❤️': 4 } });
    await p;
    expect(s.getState().posts[0]).toMatchObject({ i_hearted: true, heart_count: 4 });
  });

  it('rolls back with a plain message when it fails', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const api = be.clientFor(jo.id);
    jest.spyOn(api, 'setReaction').mockRejectedValueOnce(new ApiError('NETWORK'));
    const s = make(api);
    await s.refresh();
    await s.toggleHeart(id!);
    expect(s.getState().posts[0]).toMatchObject({ i_hearted: false, heart_count: 0 });
    expect(s.getState().notice).toBe("No internet right now. We'll keep trying.");
  });

  it('HARD-9 a quick double tap sends in order, never flickers back, and ends where the server is', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const api = be.clientFor(jo.id);
    const real = be.clientFor(jo.id);
    const gate = deferred<void>();
    let calls = 0;
    jest.spyOn(api, 'setReaction').mockImplementation(async (pid, emoji) => {
      calls += 1;
      if (calls === 1) await gate.promise;
      return real.setReaction(pid, emoji);
    });
    const s = make(api);
    await s.refresh();
    const t1 = s.toggleHeart(id!);
    const t2 = s.toggleHeart(id!);
    expect(s.getState().posts[0]).toMatchObject({ i_hearted: false, heart_count: 0 });
    await Promise.resolve();
    expect(calls).toBe(1); // the second waits for the first
    gate.resolve();
    await t1;
    expect(s.getState().posts[0]).toMatchObject({ i_hearted: false }); // no flicker back to the first answer
    await t2;
    expect(calls).toBe(2);
    expect(s.getState().posts[0]).toMatchObject({ i_hearted: false, heart_count: 0 });
    expect((await real.getFeed({ space: SPACE }))[0]).toMatchObject({ i_hearted: false, heart_count: 0 });
  });

  it('keeps the optimistic heart if a refresh lands while it is in flight', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const api = be.clientFor(jo.id);
    const d = deferred<ReactionState>();
    jest.spyOn(api, 'setReaction').mockImplementationOnce(() => d.promise);
    const s = make(api);
    await s.refresh();
    const p = s.toggleHeart(id!);
    await s.refresh();
    expect(s.getState().posts[0]).toMatchObject({ i_hearted: true });
    d.resolve({ my_reaction: '❤️', heart_count: 1, counts: { '❤️': 1 } });
    await p;
  });

  it('HARD-14 (B11) a reaction summary read before a tap never hides the confirmed reaction', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const api = be.clientFor(jo.id);
    const s = make(api);
    await s.refresh();
    const stale = deferred<Awaited<ReturnType<HearthApi['reactionSummary']>>>();
    jest.spyOn(api, 'reactionSummary').mockImplementationOnce(() => stale.promise);
    const r = s.refresh(); // its summary is read before the tap
    await new Promise((res) => setTimeout(res, 0));
    await s.react(id!, '😂'); // confirmed by the server
    expect(s.getState().posts[0]).toMatchObject({ my_reaction: '😂', reaction_counts: { '😂': 1 } });
    stale.resolve([{ post_id: id!, my_reaction: null, counts: {} }]);
    await r;
    expect(s.getState().posts[0]).toMatchObject({ my_reaction: '😂', reaction_counts: { '😂': 1 } });
  });
});

describe('BETA-REPLY-2 comments', () => {
  it('shows the comment at once, then confirms it', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const s = make(be.clientFor(jo.id));
    await s.refresh();
    const p = s.addComment(id!, 'So cute!', { id: jo.id, name: 'Grandma Jo' });
    expect(s.getState().comments[id!]).toEqual([expect.objectContaining({ body: 'So cute!', status: 'sending' })]);
    await p;
    expect(s.getState().comments[id!]).toEqual([expect.objectContaining({ body: 'So cute!', status: 'sent' })]);
    expect(s.getState().posts[0]!.comment_count).toBe(1);
    expect(await be.clientFor(chase.id).getComments(id!)).toHaveLength(1);
  });

  it('a failed comment can be retried without making a duplicate', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const api = be.clientFor(jo.id);
    const real = api.addComment.bind(api);
    jest.spyOn(api, 'addComment').mockImplementationOnce(async (a) => { await real(a); throw new ApiError('NETWORK'); });
    const s = make(api);
    await s.refresh();
    await s.addComment(id!, 'Hello', { id: jo.id, name: 'Grandma Jo' });
    const failed = s.getState().comments[id!]![0]!;
    expect(failed.status).toBe('failed');
    await s.retryComment(id!, failed.client_id!);
    expect(s.getState().comments[id!]!.map((c) => c.status)).toEqual(['sent']);
    expect(await be.clientFor(chase.id).getComments(id!)).toHaveLength(1);
  });

  it('B6: a half-typed comment survives incoming hearts and refreshes', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const s = make(be.clientFor(jo.id));
    await s.refresh();
    s.setDraft(id!, 'She looks just like');
    await be.clientFor(chase.id).toggleHeart(id!);
    await s.refresh();
    await s.toggleHeart(id!);
    expect(s.getState().drafts[id!]).toBe('She looks just like');
  });

  it('a blank comment is not sent', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const api = be.clientFor(jo.id);
    const spy = jest.spyOn(api, 'addComment');
    const s = make(api);
    await s.refresh();
    await s.addComment(id!, '   ', { id: jo.id, name: 'Grandma Jo' });
    expect(spy).not.toHaveBeenCalled();
    expect(s.getState().notice).toBe('Write something first, then tap Send.');
  });
});

describe('BETA-AUD-5 delete', () => {
  it('removes the post at once and on the server', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const s = make(be.clientFor(chase.id), memoryKV(), chase.id);
    await s.refresh();
    await s.deletePost(id!);
    expect(s.getState().posts).toHaveLength(0);
    expect(await be.clientFor(jo.id).getFeed({ space: SPACE })).toHaveLength(0);
  });

  it('puts it back if the delete fails', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const api = be.clientFor(chase.id);
    jest.spyOn(api, 'deletePost').mockRejectedValueOnce(new ApiError('NETWORK'));
    const s = make(api, memoryKV(), chase.id);
    await s.refresh();
    await s.deletePost(id!);
    expect(s.getState().posts).toHaveLength(1);
  });
});

describe('seen', () => {
  it('marks a post seen once per session, and never for the author', async () => {
    const be = FakeBackend.withFixture();
    const [id] = await seed(be, 1);
    const api = be.clientFor(jo.id);
    const spy = jest.spyOn(api, 'markSeen');
    const s = make(api);
    await s.refresh();
    s.markSeen(s.getState().posts[0]!);
    s.markSeen(s.getState().posts[0]!);
    expect(spy).toHaveBeenCalledTimes(1);
    const capi = be.clientFor(chase.id);
    const cspy = jest.spyOn(capi, 'markSeen');
    const cs = make(capi, memoryKV(), chase.id);
    await cs.refresh();
    cs.markSeen(cs.getState().posts[0]!);
    expect(cspy).not.toHaveBeenCalled();
    void id;
  });
});
