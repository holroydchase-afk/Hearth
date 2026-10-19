// DBG-1 / DBG-2 / DBG-4: Chase's on-device problem log (Oct 19). The last 20 problems, in memory
// only, with just what Claude needs to help: when, where, code, retryable, a short safe message,
// app version, Expo update id, platform + OS, Expo SDK. Never URLs, keys, emails, captions,
// file paths or photo metadata. Only on in Chase's preview builds (EXPO_PUBLIC_HEARTH_DEBUG=1).
import { ApiError, type ApiErrorCode } from '../../api/HearthApi';
import { FakeBackend, FIXTURE } from '../../api/fake/FakeBackend';
import { memoryKV } from '../../platform/kv';
import { UploadQueue, type QueueItem } from '../../upload/queue';
import { clearProblems, problems, problemText, recordProblem } from '../problemLog';
import pkg from '../../../package.json';

const CHASE = FIXTURE.users.chase.id;
const SECRET_URI = 'file:///var/mobile/Containers/Data/Application/ABC/tmp/IMG_0001.HEIC';
const CAPTION = 'Mia at the park';
const EMAIL = 'june.holroyd@example.com';
const URL = 'https://s3.us-east-005.backblazeb2.com/hearth/abc?X-Amz-Signature=deadbeef1234&X-Amz-Credential=KEYID';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
const DEK = 'c2VjcmV0a2V5c2VjcmV0a2V5c2VjcmV0a2V5MTIzNDU2';
const LEAKS = [
  'file:', '/var/mobile', 'IMG_0001', 'HEIC', CAPTION, 'Mia', EMAIL, 'june.holroyd', 'https:', 'backblazeb2', 'X-Amz', 'deadbeef', 'KEYID',
  JWT, 'eyJ', DEK, 'c2VjcmV0', '38.3498', '81.6326', 'iPhone 15', 'Apple', 'DateTimeOriginal', '2026:10:18',
];

const leakyMessage = `${SECRET_URI} "${CAPTION}" ${CAPTION} for ${EMAIL} at ${URL} token=${JWT} dek=${DEK} ` +
  'GPSLatitude 38.3498 GPSLongitude -81.6326 Make Apple Model iPhone 15 DateTimeOriginal 2026:10:18 12:01:02';

function expectNoLeaks(text: string) {
  for (const s of LEAKS) expect({ s, leaked: text.includes(s) }).toEqual({ s, leaked: false });
}

const prev = process.env.EXPO_PUBLIC_HEARTH_DEBUG;
beforeEach(() => { process.env.EXPO_PUBLIC_HEARTH_DEBUG = '1'; clearProblems(); });
afterAll(() => { process.env.EXPO_PUBLIC_HEARTH_DEBUG = prev; });

async function failUpload(prepareError: unknown, caption: string | null = CAPTION) {
  const be = FakeBackend.withFixture();
  const api = be.clientFor(CHASE);
  const q = await UploadQueue.open({
    api, kv: memoryKV(), userId: CHASE,
    prepare: async (_i: QueueItem) => { throw prepareError; },
    now: () => 1_000_000, setTimer: () => () => {},
  });
  await q.enqueue({ space: FIXTURE.space.id, caption, circleIds: [FIXTURE.circles.dadSide.id], items: [{ uri: SECRET_URI, kind: 'photo' }] });
  await q.idle();
  return q;
}

describe('DBG-1 on-device problem log', () => {
  it('DBG-1 an entry has time, where, code, retryable, message, app version, update id, platform + OS, Expo SDK', () => {
    recordProblem(new ApiError('NETWORK', 'Network request failed'), 'photos: load');
    const [e] = problems();
    expect(e).toEqual({
      time: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/),
      where: 'photos: load',
      code: 'NETWORK',
      retryable: true,
      message: 'Network request failed',
      appVersion: pkg.version,
      updateId: expect.any(String),
      platform: expect.stringMatching(/^(ios|android|web)/),
      expoSdk: '57',
    });
  });

  it('DBG-1 keeps only the last 20 problems, newest first', () => {
    for (let i = 1; i <= 25; i++) recordProblem(new ApiError('42501', `step ${i}`), `test: step ${i}`);
    const list = problems();
    expect(list).toHaveLength(20);
    expect(list[0]!.where).toBe('test: step 25');
    expect(list[19]!.where).toBe('test: step 6');
  });

  it('DBG-1 the upload queue records a final failure with its step ("upload: prepare")', async () => {
    const q = await failUpload(new ApiError('EXIF', 'exif left in'));
    expect(q.jobs()[0]!.state).toBe('failed');
    expect(problems()).toEqual([expect.objectContaining({ where: 'upload: prepare', code: 'EXIF', retryable: false, ref: q.jobs()[0]!.id })]);
  });

  it('DBG-1 a retryable upload problem (no signal) is not logged as a final failure', async () => {
    await failUpload(new ApiError('NETWORK', 'Network request failed'));
    expect(problems()).toEqual([]);
  });

  it('DBG-1 copy text is one plain block: header line then key: value lines', () => {
    recordProblem(new ApiError('EXIF', 'exif left in'), 'upload: prepare');
    const lines = problemText(problems()).split('\n');
    expect(lines[0]).toBe('Hearth problem details');
    for (const key of ['time', 'where', 'code', 'retryable', 'message', 'app version', 'update id', 'platform', 'expo sdk']) {
      expect(lines.some((l) => l.startsWith(`${key}: `))).toBe(true);
    }
    expect(lines).toContain('where: upload: prepare');
    expect(lines).toContain('retryable: no');
    for (const l of lines.slice(1)) if (l) expect(l).toMatch(/^[a-z ]+: /);
  });
});

describe('DBG-2 an entry never holds private data', () => {
  it('DBG-2 URLs, keys, tokens, emails, captions, file paths and photo metadata are redacted', () => {
    recordProblem(new ApiError('UNKNOWN', leakyMessage), 'upload: send', { scrub: [CAPTION] });
    const text = problemText(problems()) + JSON.stringify(problems());
    expectNoLeaks(text);
    expect(problems()[0]!.code).toBe('UNKNOWN');
  });

  it.each(['EXIF', 'META_LOCATION', '42501'])('DBG-2 an upload failure (%s) with a leaky message logs nothing private', async (code) => {
    await failUpload(new ApiError(code as ApiErrorCode, leakyMessage));
    await failUpload(new TypeError(leakyMessage)); // not an ApiError
    expect(problems().length).toBeGreaterThanOrEqual(1);
    expectNoLeaks(problemText(problems()) + JSON.stringify(problems()));
  });

  it('DBG-2 a non-Error thrown value and a bad "where" are made safe too', () => {
    recordProblem(`${URL} ${EMAIL}`, `screen ${SECRET_URI}`);
    const e = problems()[0]!;
    expect(e.where).toBe('unknown');
    expectNoLeaks(JSON.stringify(e));
  });

  it('DBG-2 the message is short (120 characters or fewer)', () => {
    recordProblem(new Error('x'.repeat(500)), 'app');
    expect(problems()[0]!.message.length).toBeLessThanOrEqual(120);
  });
});

describe('DBG-4 only in Chase\'s debug builds', () => {
  it('DBG-4 with EXPO_PUBLIC_HEARTH_DEBUG unset nothing is recorded', async () => {
    delete process.env.EXPO_PUBLIC_HEARTH_DEBUG;
    recordProblem(new ApiError('42501'), 'photos: load');
    await failUpload(new ApiError('EXIF', 'x'));
    expect(problems()).toEqual([]);
  });

  it('DBG-4 with EXPO_PUBLIC_HEARTH_DEBUG=1 problems are recorded', () => {
    process.env.EXPO_PUBLIC_HEARTH_DEBUG = '1';
    recordProblem(new ApiError('42501'), 'photos: load');
    expect(problems()).toHaveLength(1);
  });
});
