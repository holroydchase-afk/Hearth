import { ApiError } from '../../api/HearthApi';
import { messageFor, toApiError } from '../messages';

describe('plain-language error mapping (API.md error table)', () => {
  it.each([
    ['42501', "You can't do that here."],
    ['P0002', 'This was removed.'],
    ['54000', 'Too many tries. Wait 10 minutes.'],
  ] as const)('%s → %s', (code, text) => {
    expect(messageFor(new ApiError(code))).toBe(text);
  });

  it('22023 names the inviter (BETA-JOIN-3)', () => {
    expect(messageFor(new ApiError('22023'), { inviter: 'Chase' })).toBe(
      'This invite is too old or already used. Ask Chase for a new one.',
    );
  });

  it('22023 without a known inviter still tells her what to do', () => {
    expect(messageFor(new ApiError('22023'))).toBe(
      'This invite is too old or already used. Ask the person who invited you for a new one.',
    );
  });

  it('23514 gives the plain message for the action, never the SQL text', () => {
    const e = new ApiError('23514', 'invite must place the person in at least one circle');
    expect(messageFor(e, { action: 'post' })).toBe('Pick who should see it.');
    expect(messageFor(e, { action: 'comment' })).toBe('Write something first, then tap Send.');
    expect(messageFor(e)).not.toMatch(/circle|invite must/);
  });

  it('wrong sign-in code is plain and says what to do', () => {
    expect(messageFor(new ApiError('BAD_OTP'))).toBe(
      "That code didn't work. Check the newest email from Hearth and type the 6 numbers again.",
    );
  });

  it('no connection is calm', () => {
    expect(messageFor(new ApiError('NETWORK'))).toBe("No internet right now. We'll keep trying.");
  });

  it('long video', () => {
    expect(messageFor(new ApiError('VIDEO_TOO_LONG'))).toBe(
      'This video is longer than 1 minute. Please pick a shorter one.',
    );
  });

  it('unknown errors never leak internals and name who to call', () => {
    const msg = messageFor(new Error('relation "posts" does not exist at character 14'), { inviter: 'Chase' });
    expect(msg).toBe('Something went wrong. Try again, or call Chase.');
  });

  it('never uses words June does not use', () => {
    const codes = ['23514', '42501', 'P0002', '22023', '54000', 'BAD_OTP', 'NETWORK', 'EXIF', 'VIDEO_CAP', 'VIDEO_TOO_LONG', 'AUTH', 'UNKNOWN'] as const;
    for (const c of codes) {
      expect(messageFor(new ApiError(c), { inviter: 'Chase' })).not.toMatch(
        /\b(feed|circles?|audience|sync|upload|account|settings|expired|error|server|exception)\b/i,
      );
    }
  });
});

describe('toApiError normalizes transport errors', () => {
  it('keeps PostgREST codes', () => {
    expect(toApiError({ code: 'P0002', message: 'not found' }).code).toBe('P0002');
    expect(toApiError({ code: '22023', message: 'bad' }).code).toBe('22023');
  });
  it('treats fetch failures as NETWORK', () => {
    expect(toApiError(new TypeError('Network request failed')).code).toBe('NETWORK');
    expect(toApiError({ message: 'TypeError: Failed to fetch', code: '' }).code).toBe('NETWORK');
  });
  it('maps JWT problems to AUTH', () => {
    expect(toApiError({ code: 'PGRST301', message: 'JWT expired' }).code).toBe('AUTH');
  });
  it('passes ApiError through', () => {
    const e = new ApiError('42501');
    expect(toApiError(e)).toBe(e);
  });
  it('anything else is UNKNOWN', () => {
    expect(toApiError({ code: 'XX000', message: 'boom' }).code).toBe('UNKNOWN');
    expect(toApiError('weird').code).toBe('UNKNOWN');
  });
});
