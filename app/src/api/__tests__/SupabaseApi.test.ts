// Wire-level checks for SupabaseApi (the real stack isn't reachable here): every call uses the
// RPC name and p_* argument names from API.md, errors keep their PostgREST code, and sign-media
// HTTP statuses map to the same codes FakeApi uses.
import { ApiError } from '../HearthApi';
import { SupabaseApi } from '../SupabaseApi';

function mockClient(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const rpc = jest.fn(async () => result);
  const auth = {
    signInWithOtp: jest.fn(async () => ({ error: null })),
    verifyOtp: jest.fn(async () => ({ data: { session: { access_token: 't', user: { id: 'u1', email: 'a@b.c' } } }, error: null })),
    getSession: jest.fn(async () => ({ data: { session: { access_token: 'tok', user: { id: 'u1', email: 'a@b.c' } } } })),
    signOut: jest.fn(async () => ({ error: null })),
  };
  const update = jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) }));
  const from = jest.fn(() => ({ update }));
  return { rpc, auth, from, update } as unknown as { rpc: jest.Mock; auth: typeof auth; from: jest.Mock; update: jest.Mock };
}

const make = (c: ReturnType<typeof mockClient>, fetchImpl?: typeof fetch) =>
  new SupabaseApi({ url: 'https://x.supabase.co', anonKey: 'anon', client: c as never, fetchImpl });

describe('SupabaseApi RPC wiring (API.md names and args)', () => {
  it.each([
    ['mySpaces', [], 'my_spaces', {}],
    ['myCircles', ['S'], 'my_circles', { p_space: 'S' }],
    ['getFeed', [{ space: 'S' }], 'get_feed', { p_space: 'S', p_before_ts: null, p_before_id: null, p_limit: 20 }],
    ['getFeed', [{ space: 'S', beforeTs: 'T', beforeId: 'I', limit: 99 }], 'get_feed', { p_space: 'S', p_before_ts: 'T', p_before_id: 'I', p_limit: 50 }],
    ['createPost', [{ clientId: 'C', space: 'S', caption: 'hi', circleIds: ['a'] }], 'create_post', { p_client_id: 'C', p_space: 'S', p_caption: 'hi', p_circle_ids: ['a'], p_taken_at: null }],
    ['publishPost', ['P'], 'publish_post', { p_post: 'P' }],
    ['deletePost', ['P'], 'delete_post', { p_post: 'P' }],
    ['toggleHeart', ['P'], 'toggle_heart', { p_post: 'P' }],
    ['addComment', [{ clientId: 'C', post: 'P', body: 'b' }], 'add_comment', { p_client_id: 'C', p_post: 'P', p_body: 'b' }],
    ['getComments', ['P'], 'get_comments', { p_post: 'P', p_limit: 50 }],
    ['markSeen', ['P'], 'mark_seen', { p_post: 'P' }],
    ['redeemInvite', ['CODE'], 'redeem_invite', { p_code: 'CODE' }],
    ['invitePreview', ['CODE'], 'invite_preview', { p_code: 'CODE' }],
  ] as const)('%s → %s', async (method, args, rpcName, rpcArgs) => {
    const c = mockClient({ data: method === 'toggleHeart' || method === 'invitePreview' ? [{}] : [], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (make(c) as any)[method](...args);
    expect(c.rpc).toHaveBeenCalledWith(rpcName, rpcArgs);
  });

  it('create_invite passes the existing signature and returns {code, link}', async () => {
    const c = mockClient({ data: [{ invite_id: 'i', code: 'ABCDEFGHJK', expires_at: 'x' }], error: null });
    const r = await make(c).createInvite({ space: 'S', role: 'viewer', circleIds: ['a'], channel: 'email', targetEmail: 'g@x.com' });
    expect(c.rpc).toHaveBeenCalledWith('create_invite', expect.objectContaining({ p_space: 'S', p_role: 'viewer', p_circle_ids: ['a'], p_channel: 'email', p_target_email: 'g@x.com' }));
    expect(r).toEqual({ code: 'ABCDEFGHJK', link: 'https://thefreighttrains-team-hearth.expo.app/join/ABCDEFGHJK' }); // ONB-3 fallback
  });

  it('ONB-3 create_invite: the server\'s link (invite_link_base + token) is passed through unchanged', async () => {
    const link = 'https://thefreighttrains-team-hearth.expo.app/join/0123456789abcdef0123456789abcdef01234567';
    const c = mockClient({ data: [{ invite_id: 'i', code: 'ABCDEFGHJK', link, expires_at: 'x' }], error: null });
    const r = await make(c).createInvite({ space: 'S', role: 'viewer', circleIds: ['a'] });
    expect(r).toEqual({ code: 'ABCDEFGHJK', link });
  });

  it('keeps PostgREST error codes', async () => {
    const c = mockClient({ data: null, error: { code: 'P0002', message: 'not found' } });
    await expect(make(c).toggleHeart('P')).rejects.toMatchObject({ code: 'P0002' });
  });

  it('UX-G7: a refused invite_preview passes the inviter from details; no other RPC does', async () => {
    const c = mockClient({ data: null, error: { code: '22023', message: 'invite is invalid or expired', details: 'Chase' } });
    await expect(make(c).invitePreview('CODE')).rejects.toMatchObject({ code: '22023', inviter: 'Chase' });
    const e = await make(c).redeemInvite('CODE').catch((x: unknown) => x);
    expect(e).toMatchObject({ code: '22023' });
    expect((e as ApiError).inviter).toBeUndefined();
  });

  it('toggle_heart accepts a row or an array of one row', async () => {
    const c = mockClient({ data: { i_hearted: true, heart_count: 3 }, error: null });
    expect(await make(c).toggleHeart('P')).toEqual({ i_hearted: true, heart_count: 3 });
  });

  it('REACT-1 set_reaction and reaction_summary use API.md names; a server before 0017 falls back to a heart', async () => {
    const c = mockClient({ data: [{ my_reaction: '😂', heart_count: 2, counts: { '😂': 2 } }], error: null });
    expect(await make(c).setReaction('P', '😂')).toEqual({ my_reaction: '😂', heart_count: 2, counts: { '😂': 2 } });
    expect(c.rpc).toHaveBeenLastCalledWith('set_reaction', { p_post: 'P', p_emoji: '😂' });
    await make(c).reactionSummary(['P']);
    expect(c.rpc).toHaveBeenLastCalledWith('reaction_summary', { p_posts: ['P'] });

    const old = mockClient();
    old.rpc.mockImplementation(async (name: string) =>
      name === 'set_reaction' ? { data: null, error: { code: 'PGRST202', message: 'not found' } } : { data: { i_hearted: true, heart_count: 1 }, error: null });
    expect(await make(old).setReaction('P', '😂')).toEqual({ my_reaction: '❤️', heart_count: 1, counts: { '❤️': 1 } });
    expect(old.rpc).toHaveBeenLastCalledWith('toggle_heart', { p_post: 'P' });

    const denied = mockClient({ data: null, error: { code: '42501', message: 'no' } });
    await expect(make(denied).setReaction('P', '❤️')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('HARD-16 (B12) a server before 0017 knows only hearts', () => {
  /** A pre-0017 server: no set_reaction; toggle_heart flips a stored heart. */
  function oldServer(hearted: boolean) {
    const c = mockClient();
    let on = hearted;
    c.rpc.mockImplementation(async (name: string) => {
      if (name === 'set_reaction') return { data: null, error: { code: 'PGRST202', message: 'not found' } };
      on = !on;
      return { data: { i_hearted: on, heart_count: on ? 1 : 0 }, error: null };
    });
    return { c, hearted: () => on };
  }

  it('HARD-16 Haha or Like on a post you already hearted keeps the heart', async () => {
    for (const emoji of ['😂', '👍'] as const) {
      const s = oldServer(true);
      expect(await make(s.c).setReaction('P', emoji)).toEqual({ my_reaction: '❤️', heart_count: 1, counts: { '❤️': 1 } });
      expect(s.hearted()).toBe(true);
    }
  });

  it('HARD-16 Haha on a post without a heart adds one; Love still takes a heart back', async () => {
    const s = oldServer(false);
    expect((await make(s.c).setReaction('P', '😂')).my_reaction).toBe('❤️');
    expect(s.hearted()).toBe(true);
    expect((await make(s.c).setReaction('P', '❤️')).my_reaction).toBeNull();
    expect(s.hearted()).toBe(false);
  });
});

describe('SupabaseApi auth: 6-digit email code, no passwords, no magic links', () => {
  it('asks Supabase for an email OTP without a redirect link', async () => {
    const c = mockClient();
    await make(c).sendCode(' Grandma@Example.com ');
    expect(c.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'grandma@example.com', options: { shouldCreateUser: true } });
  });

  it('verifies with type "email" and maps a bad code to BAD_OTP', async () => {
    const c = mockClient();
    c.auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' } } as never);
    await expect(make(c).verifyCode('a@b.c', '000000')).rejects.toMatchObject({ code: 'BAD_OTP' });
    expect(c.auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.c', token: '000000', type: 'email' });
  });
});

describe('SupabaseApi sign-media', () => {
  const resp = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) });

  it('POSTs upload with the bearer token and maps statuses', async () => {
    const f = jest.fn(async () => resp(200, { post_id: 'P', expires_in: 600, items: [] }));
    const c = mockClient();
    await make(c, f as never).signUpload('P', []);
    expect(f).toHaveBeenCalledWith('https://x.supabase.co/functions/v1/sign-media', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer tok', apikey: 'anon' }),
      body: JSON.stringify({ action: 'upload', post_id: 'P', items: [] }),
    }));
    for (const [status, code] of [[422, 'EXIF'], [403, '42501'], [404, 'P0002'], [402, 'VIDEO_CAP'], [400, '23514'], [401, 'AUTH'], [500, 'NETWORK']] as const) {
      const g = jest.fn(async () => resp(status, { error: 'x' }));
      await expect(make(c, g as never).signUpload('P', [])).rejects.toEqual(new ApiError(code));
    }
  });

  it('GETs view grants by post id', async () => {
    const f = jest.fn(async () => resp(200, { post_id: 'P', expires_in: 600, items: [] }));
    await make(mockClient(), f as never).signView('8d4c8f8e-0000-4000-8000-000000000001');
    expect(f).toHaveBeenCalledWith('https://x.supabase.co/functions/v1/sign-media?post_id=8d4c8f8e-0000-4000-8000-000000000001', expect.objectContaining({ method: 'GET' }));
  });

  it('PUTs ciphertext with the signed headers', async () => {
    const f = jest.fn(async () => resp(200, {}));
    const bytes = new Uint8Array([1, 2, 3]);
    await make(mockClient(), f as never).putObject('https://b2/put', bytes, { 'content-type': 'application/octet-stream' });
    expect(f).toHaveBeenCalledWith('https://b2/put', { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
  });

  it('a network failure becomes NETWORK (the queue retries it)', async () => {
    const f = jest.fn(async () => { throw new TypeError('Network request failed'); });
    await expect(make(mockClient(), f as never).finalizeMedia(['m'])).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
