// BETA-SHARE-4: the upload queue survives an app kill, retries with backoff, never duplicates.
import { ApiError, type HearthApi, type UploadItemSpec } from '../../api/HearthApi';
import { FakeBackend, FIXTURE } from '../../api/fake/FakeBackend';
import { encryptedSize } from '../../crypto/media';
import { memoryKV } from '../../platform/kv';
import { UploadQueue, backoffMs, batchLabel, jobLabel, type QueueDeps, type Prepared } from '../queue';

const CHASE = FIXTURE.users.chase.id;

function prepared(n = 3000): Prepared {
  const display = new Uint8Array(n).map((_, i) => (i * 13) & 0xff);
  const thumb = new Uint8Array(400).map((_, i) => (i * 3) & 0xff);
  const spec: UploadItemSpec = {
    kind: 'photo', mime_type: 'image/jpeg', width: 2048, height: 1536, duration_ms: null,
    byte_size: encryptedSize(display.length), thumb_byte_size: encryptedSize(thumb.length), exif_stripped: true,
  };
  return { spec, display, thumb };
}

/** Manual clock: timers only fire when the test advances time. */
function manualClock() {
  let t = 1_000_000;
  let timers: { at: number; fn: () => void }[] = [];
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => {
      const rec = { at: t + ms, fn };
      timers.push(rec);
      return () => { timers = timers.filter((x) => x !== rec); };
    },
    pending: () => timers.map((x) => x.at - t),
    advance(ms: number) {
      t += ms;
      const due = timers.filter((x) => x.at <= t);
      timers = timers.filter((x) => x.at > t);
      due.forEach((x) => x.fn());
    },
  };
}

type Hook = Partial<Record<keyof HearthApi, (real: () => Promise<unknown>, n: number) => Promise<unknown>>>;
/** Wrap a HearthApi so a test can make a call hang (app killed), fail, or lose its response. */
function wrap(api: HearthApi, hooks: Hook): HearthApi & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  return new Proxy(api, {
    get(target, prop: string) {
      if (prop === 'calls') return calls;
      const orig = (target as unknown as Record<string, unknown>)[prop];
      if (typeof orig !== 'function') return orig;
      return (...args: unknown[]) => {
        calls[prop] = (calls[prop] ?? 0) + 1;
        const real = () => (orig as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        const hook = hooks[prop as keyof HearthApi];
        return hook ? hook(real, calls[prop]!) : real();
      };
    },
  }) as HearthApi & { calls: Record<string, number> };
}

const HANG = () => new Promise<never>(() => {});
const tick = () => new Promise((r) => setImmediate(r));
async function until(cond: () => boolean, tries = 200) {
  for (let i = 0; i < tries && !cond(); i++) await tick();
  if (!cond()) throw new Error('condition never became true');
}

function setup() {
  const be = FakeBackend.withFixture();
  const kv = memoryKV();
  const clock = manualClock();
  const deps = (api: HearthApi, extra: Partial<QueueDeps> = {}): QueueDeps => ({
    api, kv, userId: CHASE, prepare: async () => prepared(), now: clock.now, setTimer: clock.setTimer, ...extra,
  });
  const chasePosts = () => Object.values(be.state.posts).filter((p) => p.author === CHASE);
  const live = () => chasePosts().filter((p) => !p.deleted);
  const input = { space: FIXTURE.space.id, caption: 'Mia at the park', circleIds: [FIXTURE.circles.dadSide.id], items: [{ uri: 'file:///a.jpg', kind: 'photo' as const }, { uri: 'file:///b.jpg', kind: 'photo' as const }] };
  return { be, kv, clock, deps, chasePosts, live, input };
}

describe('UploadQueue state machine', () => {
  it('goes draft → uploading → finalizing → published and the post is visible to its audience', async () => {
    const s = setup();
    const seen: string[] = [];
    const q = await UploadQueue.open(s.deps(s.be.clientFor(CHASE)));
    q.subscribe(() => { const j = q.jobs()[0]; if (j && seen[seen.length - 1] !== j.state) seen.push(j.state); });
    await q.enqueue(s.input);
    await q.idle();
    expect(seen).toEqual(['draft', 'uploading', 'finalizing', 'published']);
    const feed = await s.be.clientFor(FIXTURE.users.jo.id).getFeed({ space: FIXTURE.space.id });
    expect(feed).toHaveLength(1);
    expect(feed[0]!.media.map((m) => m.status)).toEqual(['ready', 'ready']);
    expect(await s.be.clientFor(FIXTURE.users.ruth.id).getFeed({ space: FIXTURE.space.id })).toHaveLength(0);
  });

  it('persists every transition (the job is in storage before any network call)', async () => {
    const s = setup();
    const api = wrap(s.be.clientFor(CHASE), { createPost: HANG });
    const q = await UploadQueue.open(s.deps(api));
    await q.enqueue(s.input);
    await until(() => (api.calls.createPost ?? 0) > 0);
    const stored = JSON.parse((await s.kv.getItem('hearth.uploadQueue.v1'))!);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ state: 'draft', caption: 'Mia at the park', userId: CHASE });
    q.stop();
  });
});

describe('BETA-SHARE-4 app kill and resume: no duplicate, no partial post', () => {
  it.each([
    ['after create_post ran but before its answer was saved', { createPost: async (real: () => Promise<unknown>) => { await real(); return HANG(); } }],
    ['in the middle of sending the bytes', { putObject: async (real: () => Promise<unknown>, n: number) => (n === 2 ? HANG() : real()) }],
    ['after finalize, before publish', { publishPost: HANG }],
    ['while sign-media upload was answering', { signUpload: async (real: () => Promise<unknown>) => { await real(); return HANG(); } }],
  ] as [string, Hook][])('killed %s → resumes on reopen and publishes exactly one post', async (_label, hooks) => {
    const s = setup();
    const api1 = wrap(s.be.clientFor(CHASE), hooks);
    const q1 = await UploadQueue.open(s.deps(api1));
    await q1.enqueue(s.input);
    const hookName = Object.keys(hooks)[0]!;
    await until(() => (api1.calls[hookName] ?? 0) > 0 && s.chasePosts().length > 0);
    await tick();
    q1.stop(); // app killed: in-memory state (grants, timers) is gone

    const q2 = await UploadQueue.open(s.deps(s.be.clientFor(CHASE))); // app reopened
    await q2.idle();
    expect(q2.jobs()[0]?.state).toBe('published');
    expect(s.live()).toHaveLength(1);
    expect(s.live()[0]).toMatchObject({ status: 'published', caption: 'Mia at the park' });
    const feed = await s.be.clientFor(FIXTURE.users.jo.id).getFeed({ space: FIXTURE.space.id });
    expect(feed).toHaveLength(1);
    expect(feed[0]!.media).toHaveLength(2);
    expect(feed[0]!.media.every((m) => m.status === 'ready')).toBe(true);
  });

  it('a lost create_post answer is retried with the same p_client_id (one post)', async () => {
    const s = setup();
    const api = wrap(s.be.clientFor(CHASE), {
      createPost: async (real, n) => { const r = await real(); if (n === 1) throw new ApiError('NETWORK'); return r; },
    });
    const q = await UploadQueue.open(s.deps(api));
    await q.enqueue(s.input);
    await until(() => q.jobs()[0]?.state === 'failed-retryable');
    s.clock.advance(60_000);
    await q.idle();
    expect(api.calls.createPost).toBe(2);
    expect(s.chasePosts()).toHaveLength(1);
    expect(q.jobs()[0]!.state).toBe('published');
  });
});

describe('retry with backoff', () => {
  it('shows "Waiting to send" while it waits, then sends on its own', async () => {
    const s = setup();
    let offline = true;
    const api = wrap(s.be.clientFor(CHASE), { putObject: async (real) => { if (offline) throw new ApiError('NETWORK'); return real(); } });
    const q = await UploadQueue.open(s.deps(api));
    await q.enqueue(s.input);
    await until(() => q.jobs()[0]?.state === 'failed-retryable');
    expect(jobLabel(q.jobs()[0]!)).toBe('Waiting to send');
    s.clock.advance(backoffMs(1));
    await until(() => q.jobs()[0]?.attempts === 2);
    expect(q.jobs()[0]!.state).toBe('failed-retryable');
    offline = false; // signal is back
    s.clock.advance(backoffMs(2));
    await q.idle();
    expect(q.jobs()[0]!.state).toBe('published');
    expect(s.live()).toHaveLength(1);
  });

  it('backoff grows and never waits more than 30 s (done within 1 minute of signal)', () => {
    const d = [1, 2, 3, 4, 5, 6, 10, 50].map(backoffMs);
    for (let i = 1; i < d.length; i++) expect(d[i]!).toBeGreaterThanOrEqual(d[i - 1]!);
    expect(Math.max(...d)).toBeLessThanOrEqual(30_000);
    expect(d[0]).toBeGreaterThanOrEqual(1000);
  });

  it('kick() (app back in front) retries right away instead of waiting', async () => {
    const s = setup();
    let offline = true;
    const api = wrap(s.be.clientFor(CHASE), { createPost: async (real) => { if (offline) throw new ApiError('NETWORK'); return real(); } });
    const q = await UploadQueue.open(s.deps(api));
    await q.enqueue(s.input);
    await until(() => q.jobs()[0]?.state === 'failed-retryable');
    offline = false;
    q.kick();
    await q.idle();
    expect(q.jobs()[0]!.state).toBe('published');
  });

  it('an expired upload grant after a kill restarts cleanly: old draft deleted, one live post', async () => {
    const s = setup();
    const api1 = wrap(s.be.clientFor(CHASE), { putObject: HANG });
    const q1 = await UploadQueue.open(s.deps(api1));
    await q1.enqueue(s.input);
    await until(() => (api1.calls.putObject ?? 0) > 0);
    q1.stop();
    const q2 = await UploadQueue.open(s.deps(s.be.clientFor(CHASE)));
    await q2.idle();
    expect(s.chasePosts().filter((p) => p.deleted)).toHaveLength(1);
    expect(s.live()).toHaveLength(1);
    expect(s.live()[0]!.status).toBe('published');
  });
});

describe('BETA-SHARE-4: a 5-photo post survives the app being killed at any step', () => {
  const five = Array.from({ length: 5 }, (_, i) => ({ uri: `file:///${i}.jpg`, kind: 'photo' as const }));
  const stages: [string, Hook][] = [
    ['while creating the post', { createPost: HANG }],
    ['after 3 of 5 photos uploaded', { putObject: (real, n) => (n > 3 ? HANG() : real()) }],
    ['while finishing the photos', { finalizeMedia: HANG }],
    ['while publishing', { publishPost: HANG }],
  ];
  it.each(stages)('BETA-SHARE-4: killed %s -> reopening gives exactly 1 published post with all 5 photos', async (_stage, hooks) => {
    const s = setup();
    const api1 = wrap(s.be.clientFor(CHASE), hooks);
    const q1 = await UploadQueue.open(s.deps(api1));
    await q1.enqueue({ ...s.input, items: five });
    const hookName = Object.keys(hooks)[0] as keyof HearthApi;
    await until(() => (api1.calls[hookName] ?? 0) > 0);
    for (let i = 0; i < 20; i++) await tick();
    q1.stop(); // the app is killed: nothing in flight ever answers
    const q2 = await UploadQueue.open(s.deps(s.be.clientFor(CHASE)));
    await q2.idle();
    const live = s.live();
    expect(live).toHaveLength(1);
    expect(live[0]!.status).toBe('published');
    const media = Object.values(s.be.state.media).filter((m) => m.post === live[0]!.id);
    expect(media).toHaveLength(5);
    expect(media.every((m) => m.status === 'ready')).toBe(true);
    expect(q2.jobs()[0]!.state).toBe('published');
    // the audience sees one post, never a half-made one
    const feed = await s.be.clientFor(FIXTURE.users.jo.id).getFeed({ space: FIXTURE.space.id, limit: 50 });
    expect(feed.filter((p) => p.author_id === CHASE && p.caption === s.input.caption)).toHaveLength(1);
  });
});

describe('permanent failures', () => {
  it('a rule error (e.g. not allowed) stops retrying and says so', async () => {
    const s = setup();
    const api = wrap(s.be.clientFor(CHASE), { createPost: async () => { throw new ApiError('42501'); } });
    const q = await UploadQueue.open(s.deps(api));
    await q.enqueue(s.input);
    await q.idle();
    expect(q.jobs()[0]).toMatchObject({ state: 'failed', errorCode: '42501' });
    expect(s.clock.pending()).toEqual([]);
    expect(jobLabel(q.jobs()[0]!)).toBe("Didn't send");
  });

  it('a photo whose metadata could not be removed is never uploaded', async () => {
    const s = setup();
    const api = wrap(s.be.clientFor(CHASE), {});
    const q = await UploadQueue.open(s.deps(api, { prepare: async () => { throw new ApiError('EXIF'); } }));
    await q.enqueue(s.input);
    await q.idle();
    expect(q.jobs()[0]).toMatchObject({ state: 'failed', errorCode: 'EXIF' });
    expect(api.calls.signUpload ?? 0).toBe(0);
    expect(api.calls.putObject ?? 0).toBe(0);
  });

  it('retry() on a failed job and remove() work', async () => {
    const s = setup();
    let deny = true;
    const api = wrap(s.be.clientFor(CHASE), { createPost: async (real) => { if (deny) throw new ApiError('42501'); return real(); } });
    const q = await UploadQueue.open(s.deps(api));
    const job = await q.enqueue(s.input);
    await q.idle();
    deny = false;
    q.retry(job.id);
    await q.idle();
    expect(q.jobs()[0]!.state).toBe('published');
    q.remove(job.id);
    expect(q.jobs()).toEqual([]);
  });
});

describe('shared phone', () => {
  it("never runs another user's job", async () => {
    const s = setup();
    const qa = await UploadQueue.open(s.deps(wrap(s.be.clientFor(CHASE), { createPost: HANG })));
    await qa.enqueue(s.input);
    qa.stop();
    const alexApi = wrap(s.be.clientFor(FIXTURE.users.alex.id), {});
    const qb = await UploadQueue.open({ ...s.deps(alexApi), userId: FIXTURE.users.alex.id });
    await qb.idle();
    expect(qb.jobs()).toEqual([]);
    expect(alexApi.calls.createPost ?? 0).toBe(0);
  });
});

// ---------------- BETA-BULK-4 / BULK-6: a bulk pick sends as one batch ----------------
describe('BETA-BULK-4 batch progress and resume after kill', () => {
  /** 48 photos from 3 days, already planned as 5 posts (10, 10, 10, 10, 8). */
  function batchInput() {
    const sizes: [string, number][] = [['2024-07-04T14:00:00.000Z', 10], ['2024-07-04T20:00:00.000Z', 10], ['2024-07-05T15:00:00.000Z', 10],
      ['2024-07-06T15:00:00.000Z', 10], ['2024-07-06T19:00:00.000Z', 8]];
    let k = 0;
    return {
      space: FIXTURE.space.id, circleIds: [FIXTURE.circles.dadSide.id],
      posts: sizes.map(([takenAt, n]) => ({
        takenAt, items: Array.from({ length: n }, () => ({ uri: `file:///p${++k}.jpg`, kind: 'photo' as const, takenAt })),
      })),
    };
  }

  it('BETA-BULK-4 batchLabel reads "Sending 12 of 48…" across the batch, then "Sent 48 photos"', () => {
    expect(batchLabel({ done: 11, total: 48 })).toBe('Sending 12 of 48…');
    expect(batchLabel({ done: 0, total: 48 })).toBe('Sending 1 of 48…');
    expect(batchLabel({ done: 48, total: 48 })).toBe('Sent 48 photos');
    expect(batchLabel({ done: 1, total: 1 })).toBe('Sent 1 photo');
  });

  it('BETA-BULK-4/6 each post is created with its taken_at and the same batch id and size', async () => {
    const s = setup();
    const created: Record<string, unknown>[] = [];
    const api = wrap(s.be.clientFor(CHASE), { createPost: async (real) => real() });
    const spy = new Proxy(api, { get: (t, p: string) => p === 'createPost'
      ? (a: Record<string, unknown>) => { created.push(a); return t.createPost(a as never); }
      : (t as unknown as Record<string, unknown>)[p] }) as typeof api;
    const q = await UploadQueue.open(s.deps(spy));
    const batchId = await q.enqueueBatch(batchInput());
    await q.idle();
    expect(created.map((a) => a.takenAt)).toEqual(batchInput().posts.map((p) => p.takenAt));
    expect(new Set(created.map((a) => a.batchId))).toEqual(new Set([batchId]));
    expect(created.every((a) => a.batchSize === 5)).toBe(true);
    expect(s.live()).toHaveLength(5);
    expect(q.batchProgress(batchId)).toEqual({ done: 48, total: 48 });
  });

  it('BETA-BULK-4 progress counts photos across posts while sending', async () => {
    const s = setup();
    // Post 2 hangs at create_post: post 1 (10 photos) is done, the rest wait.
    const api = wrap(s.be.clientFor(CHASE), { createPost: async (real, n) => (n === 2 ? HANG() : real()) });
    const q = await UploadQueue.open(s.deps(api));
    const batchId = await q.enqueueBatch(batchInput());
    await until(() => (api.calls.createPost ?? 0) >= 2);
    await tick();
    expect(q.batchProgress(batchId)).toEqual({ done: 10, total: 48 });
    expect(batchLabel(q.batchProgress(batchId))).toBe('Sending 11 of 48…');
    q.stop();
  });

  it('BETA-BULK-4 killed mid-batch → reopened, the rest finish; 5 posts, 48 photos, no duplicates', async () => {
    const s = setup();
    // Killed while the 3rd post's bytes are going up.
    const api1 = wrap(s.be.clientFor(CHASE), { putObject: async (real, n) => (n === 45 ? HANG() : real()) });
    const q1 = await UploadQueue.open(s.deps(api1));
    const batchId = await q1.enqueueBatch(batchInput());
    await until(() => (api1.calls.putObject ?? 0) >= 45);
    await tick();
    q1.stop();

    const q2 = await UploadQueue.open(s.deps(s.be.clientFor(CHASE)));
    await q2.idle();
    expect(s.live()).toHaveLength(5);
    expect(s.live().every((p) => p.status === 'published')).toBe(true);
    const media = Object.values(s.be.state.media).filter((m) => s.live().some((p) => p.id === m.post) && m.status === 'ready');
    expect(media).toHaveLength(48);
    expect(q2.batchProgress(batchId)).toEqual({ done: 48, total: 48 });
  });
});
