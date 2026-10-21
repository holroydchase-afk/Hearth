// PERF-UP-1..3 (review RV-P1, decision A2): sending overlaps work instead of doing one thing at a time.
import type { HearthApi, UploadItemSpec } from '../../api/HearthApi';
import { FakeBackend, FIXTURE } from '../../api/fake/FakeBackend';
import { encryptedSize } from '../../crypto/media';
import { memoryKV } from '../../platform/kv';
import { UploadQueue, type Prepared, type QueueItem } from '../queue';

const CHASE = FIXTURE.users.chase.id;

function prepared(): Prepared {
  const display = new Uint8Array(3000).fill(5);
  const thumb = new Uint8Array(400).fill(6);
  const spec: UploadItemSpec = {
    kind: 'photo', mime_type: 'image/jpeg', width: 2048, height: 1536, duration_ms: null,
    byte_size: encryptedSize(display.length), thumb_byte_size: encryptedSize(thumb.length), exif_stripped: true,
  };
  return { spec, display, thumb };
}

const tick = () => new Promise((r) => setImmediate(r));
async function until(cond: () => boolean, tries = 400) {
  for (let i = 0; i < tries && !cond(); i++) await tick();
  if (!cond()) throw new Error('condition never became true');
}

/** PUTs wait until the test releases them, so the test can see how many are in flight at once. */
function gatedApi(api: HearthApi) {
  const waiting: (() => void)[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const wrapped = new Proxy(api, {
    get(target, prop: string) {
      const orig = (target as unknown as Record<string, unknown>)[prop];
      if (prop !== 'putObject' || typeof orig !== 'function') return typeof orig === 'function' ? (orig as Function).bind(target) : orig;
      return async (...args: unknown[]) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((r) => waiting.push(r));
        inFlight -= 1;
        return (orig as (...a: unknown[]) => Promise<unknown>).apply(target, args);
      };
    },
  }) as HearthApi;
  return {
    api: wrapped,
    waiting: () => waiting.length,
    releaseAll: () => { while (waiting.length) waiting.shift()!(); },
    max: () => maxInFlight,
  };
}

const items = (n: number): QueueItem[] => Array.from({ length: n }, (_, i) => ({ uri: `file:///${i}.jpg`, kind: 'photo' as const }));

async function drain(q: UploadQueue, g: ReturnType<typeof gatedApi>) {
  for (let i = 0; i < 200 && q.jobs().some((j) => j.state !== 'published'); i++) {
    await tick();
    g.releaseAll();
  }
}

describe('upload speed (A2)', () => {
  it('PERF-UP-1: a photo\'s display and thumbnail are sent at the same time', async () => {
    const be = FakeBackend.withFixture();
    const g = gatedApi(be.clientFor(CHASE));
    const q = await UploadQueue.open({ api: g.api, kv: memoryKV(), userId: CHASE, prepare: async () => prepared() });
    await q.enqueue({ space: FIXTURE.space.id, caption: null, circleIds: [FIXTURE.circles.dadSide.id], items: items(1) });
    await until(() => g.waiting() >= 2);
    expect(g.waiting()).toBe(2);
    await drain(q, g);
    expect(q.jobs()[0]!.state).toBe('published');
  });

  it('PERF-UP-2: up to two photos of a post are in flight at once, and progress only counts photos in order', async () => {
    const be = FakeBackend.withFixture();
    const g = gatedApi(be.clientFor(CHASE));
    const q = await UploadQueue.open({ api: g.api, kv: memoryKV(), userId: CHASE, prepare: async () => prepared() });
    await q.enqueue({ space: FIXTURE.space.id, caption: null, circleIds: [FIXTURE.circles.dadSide.id], items: items(5) });
    await until(() => g.waiting() >= 4);
    for (let i = 0; i < 20; i++) await tick();
    expect(g.waiting()).toBe(4); // 2 photos x (display + thumbnail), never more
    expect(q.jobs()[0]!.progress.done).toBe(0);
    await drain(q, g);
    expect(g.max()).toBe(4);
    const job = q.jobs()[0]!;
    expect(job.state).toBe('published');
    expect(job.progress).toEqual({ done: 5, total: 5 });
  });

  it('PERF-UP-3: the next post\'s photos are prepared while this post is still sending', async () => {
    const be = FakeBackend.withFixture();
    const g = gatedApi(be.clientFor(CHASE));
    const preparedUris: string[] = [];
    const q = await UploadQueue.open({
      api: g.api, kv: memoryKV(), userId: CHASE,
      prepare: async (it) => { preparedUris.push(it.uri); return prepared(); },
    });
    await q.enqueueBatch({ space: FIXTURE.space.id, circleIds: [FIXTURE.circles.dadSide.id], posts: [
      { takenAt: null, items: [{ uri: 'file:///first.jpg', kind: 'photo' }] },
      { takenAt: null, items: [{ uri: 'file:///second.jpg', kind: 'photo' }] },
    ] });
    await until(() => g.waiting() >= 2); // first post's photo is on the wire
    await until(() => preparedUris.includes('file:///second.jpg'));
    expect(q.jobs()[0]!.state).toBe('uploading');
    await drain(q, g);
    expect(q.jobs().every((j) => j.state === 'published')).toBe(true);
    expect(preparedUris.filter((u) => u === 'file:///second.jpg')).toHaveLength(1); // prepared once, not twice
  });
});
