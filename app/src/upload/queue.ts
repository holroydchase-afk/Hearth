// Persistent upload queue (BETA-SHARE-4).
//
//   draft ──create_post──▶ uploading ──sign/encrypt/PUT──▶ finalizing ──finalize+publish──▶ published
//     ▲                        │                               │
//     └──── restart ◀──────────┴── grant lost/expired, ────────┘   (old draft deleted, new p_client_id)
//                                  media failed finalize
//   any step ──network/5xx/rate limit──▶ failed-retryable ──backoff timer / kick()──▶ the step it left
//   any step ──rule error (42501, 23514, EXIF, META_*, …)──▶ failed (shown with "Try again" / "Remove";
//                                                          one code-only error report, screen 'upload')
//
// Every transition is written to storage BEFORE the next network call, so an app kill at any
// point resumes from the last saved step. create_post is idempotent on p_client_id, publish and
// delete are idempotent, so repeating a step never makes a duplicate post. Upload grants (data
// keys + presigned URLs) are kept in memory only: keys never touch disk. If the app dies after
// sign-media created media rows, those rows can't be re-signed (API.md has no re-sign call),
// so the job deletes its own unpublished draft and starts over under a fresh p_client_id.
import { ApiError, isRetryable, type ApiErrorCode, type HearthApi, type UploadGrant, type UploadItemSpec } from '../api/HearthApi';
import { encryptMediaAsync } from '../crypto/media';
import { uuid as realUuid } from '../crypto/random';
import { toApiError } from '../errors/messages';
import { recordProblem } from '../errors/problemLog';
import { errorReport } from '../errors/report';
import type { KV } from '../platform/kv';

export const STORAGE_KEY = 'hearth.uploadQueue.v1';
const MAX_RESTARTS = 3;
const GRANT_MARGIN_MS = 60_000;
/** A2: photos of one post sent at once (each sends its display and thumbnail together). */
export const SEND_CONCURRENCY = 2;

export type JobState = 'draft' | 'uploading' | 'finalizing' | 'published' | 'failed-retryable' | 'failed';
type ActiveState = 'draft' | 'uploading' | 'finalizing';

export interface QueueItem { uri: string; kind: 'photo' | 'video'; width?: number; height?: number; durationMs?: number | null; /** BETA-BULK-1: capture time read on the phone (ISO). */ takenAt?: string | null }
export interface Prepared { spec: UploadItemSpec; display: Uint8Array; thumb: Uint8Array }

export interface Job {
  id: string;
  userId: string;
  clientId: string;
  space: string;
  caption: string | null;
  /** CAP-1: the set's optional title; never logged (CAP-R3). */
  title?: string | null;
  circleIds: string[];
  items: QueueItem[];
  state: JobState;
  /** Where a failed-retryable job picks up again. */
  resumeAt?: ActiveState;
  postId?: string;
  /** Set before calling sign-media upload: media rows may exist from here on. */
  signing?: boolean;
  mediaIds?: string[];
  attempts: number;
  restarts: number;
  nextAttemptAt?: number;
  progress: { done: number; total: number };
  errorCode?: ApiErrorCode;
  createdAt: number;
  /** BETA-BULK-1: when the post's photos were taken (earliest), read on the phone. Only this date is sent. */
  takenAt?: string | null;
  /** BETA-BULK-4/6: posts from one bulk pick share a batch id; batchSize = posts in the batch. */
  batchId?: string;
  batchSize?: number;
}

export interface EnqueueInput { space: string; caption: string | null; title?: string | null; circleIds: string[]; items: QueueItem[] }

/** BETA-BULK-4: one bulk pick, already planned into posts (share/bulk.ts planBatch). */
/** CAP-9: one optional title for every post in the batch; captions stay empty. */
export interface EnqueueBatchInput { space: string; circleIds: string[]; title?: string | null; posts: { takenAt: string | null; items: QueueItem[] }[] }

/** "Sending 12 of 48 photos…" across the whole batch; "Sent 48 photos" when done. */
export function batchLabel(p: { done: number; total: number }): string {
  if (p.done >= p.total) return `Sent ${p.total} ${p.total === 1 ? 'photo' : 'photos'}`;
  return `Sending ${Math.min(p.done + 1, p.total)} of ${p.total} photos…`;
}

export interface QueueDeps {
  api: HearthApi;
  kv: KV;
  userId: string;
  /** Media pipeline: resize, strip, thumbnail. Returns plaintext bytes + the sign-media spec. */
  prepare: (item: QueueItem) => Promise<Prepared>;
  /** A1: defaults to the fastest AES-GCM the runtime has (crypto/aesGcm.ts). */
  encrypt?: (plain: Uint8Array, dek: string) => Uint8Array | Promise<Uint8Array>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => () => void;
  uuid?: () => string;
  onPublished?: (job: Job) => void;
}

export function backoffMs(attempt: number): number {
  const steps = [2_000, 4_000, 8_000, 15_000, 30_000];
  return steps[Math.min(Math.max(attempt, 1), steps.length) - 1]!;
}

/** Words the UI shows for a job. */
export function jobLabel(j: Job): string {
  switch (j.state) {
    case 'draft': return 'Getting ready…';
    case 'uploading': return j.progress.total > 1 ? `Sending ${Math.min(j.progress.done + 1, j.progress.total)} of ${j.progress.total}…` : 'Sending…';
    case 'finalizing': return 'Almost done…';
    case 'published': return 'Sent';
    case 'failed-retryable': return 'Waiting to send';
    case 'failed': return "Didn't send";
  }
}

class Killed extends Error {}

export class UploadQueue {
  private all: Job[] = [];
  private listeners = new Set<() => void>();
  private grants = new Map<string, { grant: UploadGrant; expiresAt: number }>();
  /** A2: prepared bytes per job, as a promise so the next post can be prepared while this one sends. */
  private prepared = new Map<string, Promise<Prepared[]>>();
  private timer: (() => void) | null = null;
  private loop: Promise<void> | null = null;
  private again = false;
  /** DBG-1: the step a job is in, for the problem log's "where" (never persisted). */
  private step = 'create post';
  private stopped = false;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => () => void;
  private readonly newId: () => string;
  private readonly encrypt: (p: Uint8Array, k: string) => Uint8Array | Promise<Uint8Array>;

  private constructor(private d: QueueDeps) {
    this.now = d.now ?? Date.now;
    this.setTimer = d.setTimer ?? ((fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); });
    this.newId = d.uuid ?? realUuid;
    this.encrypt = d.encrypt ?? ((p, k) => encryptMediaAsync(p, k));
  }

  static async open(d: QueueDeps): Promise<UploadQueue> {
    const q = new UploadQueue(d);
    try {
      const raw = await d.kv.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      q.all = Array.isArray(parsed) ? (parsed as Job[]) : [];
    } catch {
      q.all = [];
    }
    // Anything that was mid-flight when the app died is due now.
    for (const j of q.mine()) if (j.state === 'failed-retryable') j.nextAttemptAt = q.now();
    q.kick();
    return q;
  }

  /** This user's jobs, oldest first. */
  jobs(): Job[] {
    return this.mine().map((j) => ({ ...j, progress: { ...j.progress } }));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async enqueue(input: EnqueueInput): Promise<Job> {
    const job: Job = {
      id: this.newId(), userId: this.d.userId, clientId: this.newId(), space: input.space,
      caption: input.caption?.trim() || null, title: input.title?.trim() || null, circleIds: [...input.circleIds], items: [...input.items],
      state: 'draft', attempts: 0, restarts: 0, progress: { done: 0, total: input.items.length }, createdAt: this.now(),
    };
    this.all.push(job);
    await this.save();
    this.kick();
    return { ...job };
  }

  /**
   * BETA-BULK-4/6: enqueue every post of a bulk pick under one batch id (create_post p_batch_id,
   * p_batch_size, p_taken_at). All jobs are saved in one write before anything is sent, so an
   * app kill at any point resumes the whole batch. Returns the batch id.
   */
  async enqueueBatch(input: EnqueueBatchInput): Promise<string> {
    const posts = input.posts.filter((p) => p.items.length > 0);
    if (posts.length === 0 || posts.length > 100) throw new ApiError('23514', 'a batch is 1 to 100 posts');
    const batchId = this.newId();
    const title = input.title?.trim() || null;
    for (const p of posts) {
      this.all.push({
        id: this.newId(), userId: this.d.userId, clientId: this.newId(), space: input.space,
        caption: null, circleIds: [...input.circleIds], items: [...p.items],
        state: 'draft', attempts: 0, restarts: 0, progress: { done: 0, total: p.items.length }, createdAt: this.now(),
        takenAt: p.takenAt ?? null, batchId, batchSize: posts.length, title,
      });
    }
    await this.save();
    this.kick();
    return batchId;
  }

  /** Photos sent so far / photos in the batch, across all its posts. */
  batchProgress(batchId: string): { done: number; total: number } {
    let done = 0, total = 0;
    for (const j of this.mine()) {
      if (j.batchId !== batchId) continue;
      total += j.items.length;
      done += j.state === 'published' ? j.items.length : j.state === 'finalizing' ? j.items.length : Math.min(j.progress.done, j.items.length);
    }
    return { done, total };
  }

  /** Batches that still have something to send (for "Sending 12 of 48 photos…"). */
  activeBatches(): { batchId: string; done: number; total: number }[] {
    const ids = [...new Set(this.mine().filter((j) => j.batchId && j.state !== 'published').map((j) => j.batchId!))];
    return ids.map((batchId) => ({ batchId, ...this.batchProgress(batchId) }));
  }

  /** Run due jobs now (app came to the front, network came back, timer fired). */
  kick(): void {
    if (this.stopped) return;
    for (const j of this.mine()) if (j.state === 'failed-retryable') j.nextAttemptAt = Math.min(j.nextAttemptAt ?? 0, this.now());
    if (this.loop) { this.again = true; return; }
    this.loop = this.runLoop().finally(() => { this.loop = null; });
  }

  async idle(): Promise<void> {
    await Promise.resolve();
    while (this.loop) await this.loop;
  }

  retry(id: string): void {
    const j = this.find(id);
    if (!j || (j.state !== 'failed' && j.state !== 'failed-retryable')) return;
    j.state = 'failed-retryable';
    j.resumeAt ??= 'draft';
    j.nextAttemptAt = this.now();
    j.errorCode = undefined;
    this.kick(); // the loop persists the transition before any network call
  }

  remove(id: string): void {
    const j = this.find(id);
    if (!j) return;
    if (j.postId && j.state !== 'published') this.d.api.deletePost(j.postId).catch(() => {});
    this.all = this.all.filter((x) => x.id !== id);
    this.grants.delete(id);
    this.prepared.delete(id);
    void this.save();
  }

  /** Simulates / handles process death in tests and on sign-out: nothing more is written. */
  stop(): void {
    this.stopped = true;
    this.timer?.();
    this.timer = null;
  }

  // ---------------- internals ----------------
  private mine(): Job[] {
    return this.all.filter((j) => j.userId === this.d.userId);
  }
  private find(id: string): Job | undefined {
    return this.mine().find((j) => j.id === id);
  }
  private emit(): void {
    this.listeners.forEach((f) => f());
  }
  private async save(): Promise<void> {
    if (this.stopped) throw new Killed();
    await this.d.kv.setItem(STORAGE_KEY, JSON.stringify(this.all));
    if (this.stopped) throw new Killed();
    this.emit();
  }

  private due(): Job | undefined {
    const now = this.now();
    return this.mine().find((j) =>
      j.state === 'draft' || j.state === 'uploading' || j.state === 'finalizing' ||
      (j.state === 'failed-retryable' && (j.nextAttemptAt ?? 0) <= now));
  }

  private async runLoop(): Promise<void> {
    try {
      do {
        this.again = false;
        let job: Job | undefined;
        while (!this.stopped && (job = this.due())) await this.runJob(job);
      } while (this.again && !this.stopped);
    } catch (e) {
      if (!(e instanceof Killed)) throw e;
      return;
    }
    this.schedule();
  }

  private schedule(): void {
    this.timer?.();
    this.timer = null;
    if (this.stopped) return;
    const waits = this.mine().filter((j) => j.state === 'failed-retryable').map((j) => (j.nextAttemptAt ?? 0) - this.now());
    if (!waits.length) return;
    this.timer = this.setTimer(() => { this.timer = null; this.kick(); }, Math.max(0, Math.min(...waits)));
  }

  private async runJob(job: Job): Promise<void> {
    if (job.state === 'failed-retryable') {
      job.state = job.resumeAt ?? 'draft';
      job.resumeAt = undefined;
      await this.save();
    }
    try {
      while (job.state === 'draft' || job.state === 'uploading' || job.state === 'finalizing') {
        if (this.stopped) throw new Killed();
        if (job.state === 'draft') await this.stepDraft(job);
        else if (job.state === 'uploading') await this.stepUpload(job);
        else await this.stepFinalize(job);
      }
    } catch (raw) {
      if (raw instanceof Killed) throw raw;
      if (this.stopped) throw new Killed();
      const err = toApiError(raw);
      const at = job.state as ActiveState;
      job.attempts += 1;
      job.errorCode = err.code;
      if (isRetryable(err) || err.code === 'AUTH') {
        job.state = 'failed-retryable';
        job.resumeAt = at;
        job.nextAttemptAt = this.now() + backoffMs(job.attempts);
      } else {
        job.state = 'failed';
        job.resumeAt = at;
        this.report(err, job);
      }
      await this.save();
    }
  }

  /**
   * MEDIA-3 / BETA-OPS-1: one code-only report when a job fails for good (errorReport sends the
   * error's type and code, never its message, so no URL, key, caption or metadata). Fire and
   * forget: a report that can't be sent never changes the job.
   */
  private report(err: ApiError, job: Job): void {
    // DBG-1: Chase's on-device problem log (debug builds only; redacted, caption scrubbed).
    recordProblem(err, `upload: ${this.step}`, { scrub: [job.caption, job.title ?? null], ref: job.id });
    try {
      this.d.api.reportClientError(errorReport(err, 'upload')).catch(() => {});
    } catch {
      // never let reporting break the queue
    }
  }

  private async stepDraft(job: Job): Promise<void> {
    this.step = 'create post';
    const postId = await this.d.api.createPost({
      clientId: job.clientId, space: job.space, caption: job.caption, circleIds: job.circleIds,
      ...(job.takenAt ? { takenAt: job.takenAt } : {}),
      ...(job.title ? { title: job.title } : {}),
      ...(job.batchId ? { batchId: job.batchId, batchSize: job.batchSize ?? null } : {}),
    });
    if (this.stopped) throw new Killed();
    job.postId = postId;
    job.state = 'uploading';
    await this.save();
  }

  /** Resize, strip and thumbnail every photo of a job once; a failed run is forgotten so a retry starts fresh. */
  private prepareJob(job: Job): Promise<Prepared[]> {
    const hit = this.prepared.get(job.id);
    if (hit) return hit;
    const p = (async () => {
      const out: Prepared[] = [];
      for (const item of job.items) out.push(await this.d.prepare(item));
      return out;
    })();
    this.prepared.set(job.id, p);
    p.catch(() => { if (this.prepared.get(job.id) === p) this.prepared.delete(job.id); });
    return p;
  }

  /** A2: start preparing the next post while this one sends (the phone's image work overlaps the network). */
  private prepareAhead(current: Job): void {
    const next = this.mine().find((j) => j.id !== current.id && j.state === 'draft' && !this.prepared.has(j.id));
    if (next) this.prepareJob(next).catch(() => {});
  }

  private grantFor(job: Job): UploadGrant | null {
    const g = this.grants.get(job.id);
    return g && g.expiresAt - GRANT_MARGIN_MS > this.now() ? g.grant : null;
  }

  /** Throw away the unpublished draft and start again under a new p_client_id. */
  private async restart(job: Job): Promise<void> {
    this.step = 'restart';
    if (job.restarts >= MAX_RESTARTS) throw new ApiError('UNKNOWN', 'too many restarts');
    const old = job.postId;
    if (old) await this.d.api.deletePost(old).catch(() => {});
    if (this.stopped) throw new Killed();
    job.restarts += 1;
    job.clientId = this.newId();
    job.postId = undefined;
    job.mediaIds = undefined;
    job.signing = undefined;
    job.progress = { done: 0, total: job.items.length };
    job.state = 'draft';
    this.grants.delete(job.id);
    await this.save();
  }

  private async stepUpload(job: Job): Promise<void> {
    let grant = this.grantFor(job);
    if (!grant && (job.signing || job.mediaIds)) return this.restart(job);

    this.step = 'prepare';
    const prepared = await this.prepareJob(job);
    if (this.stopped) throw new Killed();
    this.prepareAhead(job);
    if (!grant) {
      job.signing = true;
      await this.save();
      this.step = 'sign';
      grant = await this.d.api.signUpload(job.postId!, prepared.map((p) => p.spec));
      if (this.stopped) throw new Killed();
      this.grants.set(job.id, { grant, expiresAt: this.now() + grant.expires_in * 1000 });
      job.mediaIds = [...grant.items].sort((a, b) => a.item_index - b.item_index).map((i) => i.media_id);
      job.progress = { done: 0, total: job.items.length };
      await this.save();
    }
    // A2: up to SEND_CONCURRENCY photos in flight, each sending its display and thumbnail together.
    // Progress counts only photos sent in order, so a resume never skips one.
    this.step = 'send';
    const order = [...grant.items].sort((a, b) => a.item_index - b.item_index).filter((g) => g.item_index >= job.progress.done);
    const finished = new Set<number>();
    let next = 0;
    let failure: unknown = null;
    const send = async (g: UploadGrant['items'][number]) => {
      const p = prepared[g.item_index]!;
      const put = async (url: string, plain: Uint8Array) => this.d.api.putObject(url, await this.encrypt(plain, g.dek), g.required_headers);
      await Promise.all([put(g.display_put_url, p.display), put(g.thumb_put_url, p.thumb)]);
      if (this.stopped) throw new Killed();
      finished.add(g.item_index);
      let done = job.progress.done;
      while (finished.has(done)) done += 1;
      job.progress = { done, total: job.items.length };
      this.emit();
    };
    const worker = async () => {
      while (failure === null && next < order.length) {
        const g = order[next++]!;
        try { await send(g); } catch (e) { failure ??= e; }
      }
    };
    await Promise.all(Array.from({ length: SEND_CONCURRENCY }, worker));
    if (failure !== null) throw failure;
    job.state = 'finalizing';
    await this.save();
  }

  private async stepFinalize(job: Job): Promise<void> {
    const ids = job.mediaIds ?? [];
    this.step = 'finalize';
    if (ids.length) {
      const res = await this.d.api.finalizeMedia(ids);
      if (this.stopped) throw new Killed();
      // Rows already finalized in an earlier run aren't pending, so finalize skips them.
      if (res.some((r) => !r.ok)) return this.restart(job);
    }
    this.step = 'publish';
    try {
      await this.d.api.publishPost(job.postId!);
    } catch (e) {
      // Media not ready (e.g. a row from a run that died mid-sign): start over cleanly.
      if (toApiError(e).code === '23514') return this.restart(job);
      throw e;
    }
    if (this.stopped) throw new Killed();
    job.state = 'published';
    job.errorCode = undefined;
    this.prepared.delete(job.id);
    this.grants.delete(job.id);
    await this.save();
    this.d.onPublished?.({ ...job });
  }
}
