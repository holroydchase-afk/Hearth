// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// MEDIA-3 + BETA-OPS-1 (SPEC-MEDIA 1.3 step 3; UAT item 6): when a job fails for good in the
// prepare step, the queue sends ONE error report with the error code only (no URL, key, caption
// or metadata) through the existing report_client_error path. Today it sends nothing, which is
// why the hosted logs showed no client_errors row for Chase's first iPhone photo.
import { ApiError, type ApiErrorCode, type HearthApi } from '../../api/HearthApi';
import { FakeBackend, FIXTURE } from '../../api/fake/FakeBackend';
import { memoryKV } from '../../platform/kv';
import { UploadQueue, jobLabel, type QueueItem } from '../queue';

const CHASE = FIXTURE.users.chase.id;
const SECRET_URI = 'file:///var/mobile/Containers/Data/Application/ABC/tmp/IMG_0001.HEIC';
const CAPTION = 'Mia at the park';
/** A prepare error whose message carries everything that must never leave the phone. */
const leaky = (code: string) => new ApiError(code as ApiErrorCode, `${SECRET_URI} "${CAPTION}" GPS 38.3498,-81.6326 dek=c2VjcmV0a2V5 https://b2.example/put?sig=abc`);

async function run(prepareError: unknown) {
  const be = FakeBackend.withFixture();
  const api = be.clientFor(CHASE);
  const sign = jest.spyOn(api as HearthApi, 'signUpload');
  const q = await UploadQueue.open({
    api, kv: memoryKV(), userId: CHASE,
    prepare: async (_i: QueueItem) => { throw prepareError; },
    now: () => 1_000_000, setTimer: () => () => {},
  });
  await q.enqueue({ space: FIXTURE.space.id, caption: CAPTION, circleIds: [FIXTURE.circles.dadSide.id], items: [{ uri: SECRET_URI, kind: 'photo' }] });
  await q.idle();
  await new Promise((r) => setImmediate(r)); // a fire-and-forget report gets one tick to land
  return { be, q, sign, reports: be.state.clientErrors ?? [] };
}

describe('non-retryable prepare failure is reported by code only', () => {
  it.each(['EXIF', 'META_LOCATION'])('MEDIA-3 BETA-OPS-1 prepare fails %s: job is "Didn\'t send", nothing is signed, one report with only the code', async (code) => {
    const { q, sign, reports } = await run(leaky(code));
    const job = q.jobs()[0]!;
    expect({ state: job.state, errorCode: job.errorCode, label: jobLabel(job) }).toEqual({ state: 'failed', errorCode: code, label: "Didn't send" });
    expect(sign).not.toHaveBeenCalled();
    expect(reports).toEqual([{ appVersion: expect.any(String), os: expect.any(String), screen: 'upload', kind: 'ApiError', code }]);
    const sent = JSON.stringify(reports);
    for (const s of ['file:', 'IMG_0001', CAPTION, '38.3498', 'c2VjcmV0a2V5', 'https:', 'sig=']) expect({ s, leaked: sent.includes(s) }).toEqual({ s, leaked: false });
  });

  it('MEDIA-3 BETA-OPS-1 a retryable prepare failure (no signal) is not reported', async () => {
    const { q, reports } = await run(new ApiError('NETWORK', SECRET_URI));
    expect(q.jobs()[0]!.state).toBe('failed-retryable');
    expect(reports).toEqual([]);
  });

  it('MEDIA-3 BETA-OPS-1 a report that cannot be sent never changes the job or throws', async () => {
    const be = FakeBackend.withFixture();
    const api = be.clientFor(CHASE);
    const report = jest.spyOn(api as HearthApi, 'reportClientError').mockRejectedValue(new ApiError('NETWORK'));
    const q = await UploadQueue.open({ api, kv: memoryKV(), userId: CHASE, prepare: async () => { throw leaky('EXIF'); }, now: () => 1, setTimer: () => () => {} });
    await q.enqueue({ space: FIXTURE.space.id, caption: null, circleIds: [FIXTURE.circles.dadSide.id], items: [{ uri: SECRET_URI, kind: 'photo' }] });
    await q.idle();
    await new Promise((r) => setImmediate(r));
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0]).toEqual({ appVersion: expect.any(String), os: expect.any(String), screen: 'upload', kind: 'ApiError', code: 'EXIF' });
    expect(q.jobs()[0]!.state).toBe('failed');
  });
});
