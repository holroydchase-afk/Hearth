// Persistent upload queue (BETA-SHARE-4).
//
//   draft ──create_post──▶ uploading ──sign/encrypt/PUT──▶ finalizing ──finalize+publish──▶ published
//     ▲                        │                               │
//     └──── restart ◀──────────┴── grant lost/expired, ────────┘   (old draft deleted, new p_client_id)
//                                  media failed finalize
//   any step ──network/5xx/rate limit──▶ failed-retryable ──backoff timer / kick()──▶ the step it left
//   any step ──rule error (42501, 23514, EXIF, …)──▶ failed (shown with "Try again" / "Remove")
//
// Every transition is written to storage BEFORE the next network call, so an app kill at any
// point resumes from the last saved step. create_post is idempotent on p_client_id, publish and
// delete are idempotent, so repeating a step never makes a duplicate post. Upload grants (data
// keys + presigned URLs) are kept in memory only: keys never touch disk. If the app dies after
// sign-media created media rows, those rows can't be re-signed (API.md has no re-sign call),
// so the job deletes its own unpublished draft and starts over under a fresh p_client_id.
import { ApiError, isRetryable, type ApiErrorCode, type HearthApi, type UploadGrant, type UploadItemSpec } from '../api/HearthApi';
import { encryptMedia } from '../crypto/media';
import { uuid as realUuid } from '../crypto/random';
import { toApiError } from '../errors/messages';
import type { KV } from '../platform/kv';

export const STORAGE_KEY = 'hearth.uploadQueue.v1';
const MAX_RESTARTS = 3;
const GRANT_MARGIN_MS = 60_000;

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
}

export interface EnqueueInput { space: string; caption: string | null; circleIds: string[]; items: QueueItem[] }

/** BETA-BULK-4: one bulk pick, already planned into posts (share/bulk.ts planBatch). */
export interface EnqueueBatchInput { space: string; circleIds: string[]; posts: { takenAt: string | null; items: QueueItem[] }[] }

/** "Sending 12 of 48…" across the whole batch; "Sent 48 photos" when done. NOT BUILT YET (plan step 3). */
export function batchLabel(_p: { done: number; total: number }): string {
  throw new Error('not built yet: batchLabel (BETA-BULK-4)');
}

export interface QueueDeps {
  api: HearthApi;
  kv: KV;
  userId: string;
  /** Media pipeline: resize, strip, thumbnail. Returns plaintext bytes + the sign-media spec. */
  prepare: (item: QueueItem) => Promise<Prepared>;
  encrypt?: (plain: Uint8Array, dek: string) => Uint8Array;
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
  private prepared = new Map<string, Prepared[]>();
  private timer: (() => void) | null = null;
  private loop: Promise<void> | null = null;
  private again = false;
  private stopped = false;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => () => void;
  private readonly newId: () => string;
  private readonly encrypt: (p: Uint8Array, k: string) => Uint8Array;

  private constructor(private d: QueueDeps) {
    this.now = d.now ?? Date.now;
    this.setTimer = d.setTimer ?? ((fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); });
    this.newId = d.uuid ?? realUuid;
    this.encrypt = d.encrypt ?? ((p, k) => encryptMedia(p, k));
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
      caption: input.caption?.trim() || null, circleIds: [...input.circleIds], items: [...input.items],
      state: 'draft', attempts: 0, restarts: 0, progress: { done: 0, total: input.items.length }, createdAt: this.now(),
    };
    this.all.push(job);
    await this.save();
    this.kick();
    return { ...job };
  }

  /**
   * BETA-BULK-4/6: enqueue every post of a bulk pick under one batch id (create_post p_batch_id,
   * p_batch_size, p_taken_at). Returns the batch id. NOT BUILT YET (overnight plan step 3).
   */
  async enqueueBatch(_input: EnqueueBatchInput): Promise<string> {
    throw new Error('not built yet: enqueueBatch (BETA-BULK-4)');
  }

  /** Photos sent so far / photos in the batch, across all its posts. NOT BUILT YET. */
  batchProgress(_batchId: string): { done: number; total: number } {
    throw new Error('not built yet: batchProgress (BETA-BULK-4)');
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
      }
      await this.save();
    }
  }

  private async stepDraft(job: Job): Promise<void> {
    const postId = await this.d.api.createPost({ clientId: job.clientId, space: job.space, caption: job.caption, circleIds: job.circleIds });
    if (this.stopped) throw new Killed();
    job.postId = postId;
    job.state = 'uploading';
    await this.save();
  }

  private grantFor(job: Job): UploadGrant | null {
    const g = this.grants.get(job.id);
    return g && g.expiresAt - GRANT_MARGIN_MS > this.now() ? g.grant : null;
  }

  /** Throw away the unpublished draft and start again under a new p_client_id. */
  private async restart(job: Job): Promise<void> {
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

    let prepared = this.prepared.get(job.id);
    if (!prepared) {
      prepared = [];
      for (const item of job.items) prepared.push(await this.d.prepare(item));
      this.prepared.set(job.id, prepared);
    }
    if (!grant) {
      job.signing = true;
      await this.save();
      grant = await this.d.api.signUpload(job.postId!, prepared.map((p) => p.spec));
      if (this.stopped) throw new Killed();
      this.grants.set(job.id, { grant, expiresAt: this.now() + grant.expires_in * 1000 });
      job.mediaIds = [...grant.items].sort((a, b) => a.item_index - b.item_index).map((i) => i.media_id);
      job.progress = { done: 0, total: job.items.length };
      await this.save();
    }
    for (const g of [...grant.items].sort((a, b) => a.item_index - b.item_index)) {
      if (g.item_index < job.progress.done) continue;
      const p = prepared[g.item_index]!;
      await this.d.api.putObject(g.display_put_url, this.encrypt(p.display, g.dek), g.required_headers);
      await this.d.api.putObject(g.thumb_put_url, this.encrypt(p.thumb, g.dek), g.required_headers);
      if (this.stopped) throw new Killed();
      job.progress = { done: g.item_index + 1, total: job.items.length };
      this.emit();
    }
    job.state = 'finalizing';
    await this.save();
  }

  private async stepFinalize(job: Job): Promise<void> {
    const ids = job.mediaIds ?? [];
    if (ids.length) {
      const res = await this.d.api.finalizeMedia(ids);
      if (this.stopped) throw new Killed();
      // Rows already finalized in an earlier run aren't pending, so finalize skips them.
      if (res.some((r) => !r.ok)) return this.restart(job);
    }
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
