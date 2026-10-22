// API.md contract tests. They run against every HearthApi implementation we can reach:
// FakeApi always; SupabaseApi when HEARTH_API_URL/HEARTH_ANON_KEY/HEARTH_USERS_JSON are set.
import { ApiError, type HearthApi } from '../HearthApi';
import { JOIN_LINK_BASE } from '../links';
import { decryptMedia, encryptMedia, encryptedSize } from '../../crypto/media';
import { uuid } from '../../crypto/random';
import { fakeHarness } from './fakeHarness';
import type { ContractHarness, HarnessFactory } from './harness';
import { supabaseCaps, supabaseEnvReady, supabaseHarness } from './supabaseHarness';

interface Caps { joiner: boolean; ratelimit: boolean; media: boolean }
const factories: [string, HarnessFactory, Caps][] = [['FakeApi', fakeHarness, { joiner: true, ratelimit: true, media: true }]];
if (supabaseEnvReady()) factories.push(['SupabaseApi', supabaseHarness, supabaseCaps()]);
else describe('SupabaseApi contract', () => it.skip('skipped: HEARTH_API_URL / HEARTH_ANON_KEY / HEARTH_USERS_JSON not set', () => {}));

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ApiError ? e.code : `non-ApiError: ${String(e)}`;
  }
}

describe.each(factories)('%s contract (API.md)', (_name, factory, caps) => {
  const itJoiner = caps.joiner ? it : it.skip;
  const itRate = caps.ratelimit ? it : it.skip;
  const itMedia = caps.media ? it : it.skip;
  let h: ContractHarness;
  let poster: HearthApi;
  let viewerIn: HearthApi;
  let viewerOut: HearthApi;

  beforeEach(async () => {
    h = await factory();
    poster = h.as('poster');
    viewerIn = h.as('viewerIn');
    viewerOut = h.as('viewerOut');
  });

  async function publishedPost(caption = 'Mia at the park', circles = [h.circleIn]): Promise<string> {
    const id = await poster.createPost({ clientId: uuid(), space: h.spaceId, caption, circleIds: circles });
    await h.attachReadyMedia(poster, id);
    await poster.publishPost(id);
    return id;
  }
  const feedIds = async (api: HearthApi) => (await api.getFeed({ space: h.spaceId, limit: 50 })).map((p) => p.post_id);

  describe('my_spaces / my_circles', () => {
    it('poster is owner and can post; viewer cannot and knows who invited them', async () => {
      const ps = (await poster.mySpaces()).find((s) => s.space_id === h.spaceId);
      expect(ps).toMatchObject({ space_id: h.spaceId, can_post: true });
      expect(['owner', 'adult']).toContain(ps!.role);
      const vs = (await viewerIn.mySpaces()).find((s) => s.space_id === h.spaceId);
      expect(vs).toMatchObject({ space_id: h.spaceId, role: 'viewer', can_post: false });
      expect(typeof vs!.inviter_name).toBe('string');
    });

    it('posters get their circles with counts and names; viewers get []', async () => {
      const circles = await poster.myCircles(h.spaceId);
      const inC = circles.find((c) => c.circle_id === h.circleIn);
      expect(inC).toBeDefined();
      expect(inC!.member_count).toBe(inC!.member_names.length);
      expect(await viewerIn.myCircles(h.spaceId)).toEqual([]);
    });
  });

  describe('create_post / publish_post', () => {
    it('BETA-AUD-2 at least one circle is required (23514)', async () => {
      expect(await code(poster.createPost({ clientId: uuid(), space: h.spaceId, caption: 'x', circleIds: [] }))).toBe('23514');
    });

    it('viewers cannot post (42501)', async () => {
      expect(await code(viewerIn.createPost({ clientId: uuid(), space: h.spaceId, caption: 'x', circleIds: [h.circleIn] }))).toBe('42501');
    });

    it('BETA-SHARE-4 idempotent on p_client_id: a retry returns the same post, never a duplicate', async () => {
      const clientId = uuid();
      const a = await poster.createPost({ clientId, space: h.spaceId, caption: 'retry me', circleIds: [h.circleIn] });
      const b = await poster.createPost({ clientId, space: h.spaceId, caption: 'retry me', circleIds: [h.circleIn] });
      expect(b).toBe(a);
      await h.attachReadyMedia(poster, a);
      await poster.publishPost(a);
      await poster.publishPost(a); // publishing twice is a no-op
      const ids = await feedIds(poster);
      expect(ids.filter((x) => x === a)).toHaveLength(1);
    });

    it('a post with no media cannot be published (23514)', async () => {
      const id = await poster.createPost({ clientId: uuid(), space: h.spaceId, caption: 'empty', circleIds: [h.circleIn] });
      expect(await code(poster.publishPost(id))).toBe('23514');
    });

    it('drafts never appear in any feed', async () => {
      const id = await poster.createPost({ clientId: uuid(), space: h.spaceId, caption: 'draft', circleIds: [h.circleIn] });
      expect(await feedIds(poster)).not.toContain(id);
      expect(await feedIds(viewerIn)).not.toContain(id);
    });
  });

  describe('visibility (BETA-AUD-3, BETA-SEE-1 client side)', () => {
    it('the audience sees it; someone outside it does not, on every path', async () => {
      const id = await publishedPost();
      expect(await feedIds(viewerIn)).toContain(id);
      expect(await feedIds(viewerOut)).not.toContain(id);
      expect(await code(viewerOut.toggleHeart(id))).toBe('P0002');
      expect(await code(viewerOut.addComment({ clientId: uuid(), post: id, body: 'hi' }))).toBe('P0002');
      expect(await code(viewerOut.markSeen(id))).toBe('P0002');
      const comments = await viewerOut.getComments(id).catch((e: ApiError) => e.code);
      expect(comments === 'P0002' || (Array.isArray(comments) && comments.length === 0)).toBe(true);
    });

    it('an invisible post looks exactly like a missing one (P0002, never 42501)', async () => {
      const id = await publishedPost();
      const missing = uuid();
      expect(await code(viewerOut.toggleHeart(id))).toBe(await code(viewerOut.toggleHeart(missing)));
      expect(await code(viewerOut.deletePost(id))).toBe('P0002');
    });

    it('audience, seen_count and reach_count are for the author only', async () => {
      const id = await publishedPost();
      const mine = (await poster.getFeed({ space: h.spaceId })).find((p) => p.post_id === id)!;
      expect(mine.audience).toEqual([expect.objectContaining({ circle_id: h.circleIn, name: expect.any(String), member_count: expect.any(Number) })]);
      expect(mine.seen_count).toBe(0);
      expect(mine.reach_count).toBeGreaterThanOrEqual(1);
      const theirs = (await viewerIn.getFeed({ space: h.spaceId })).find((p) => p.post_id === id)!;
      expect(theirs.audience).toBeNull();
      expect(theirs.seen_count).toBeNull();
      expect(theirs.reach_count).toBeNull();
    });
  });

  describe('BETA-NOTIFY-6 seen by', () => {
    it('counts audience members once; the author does not count', async () => {
      const id = await publishedPost();
      await viewerIn.markSeen(id);
      await viewerIn.markSeen(id);
      await poster.markSeen(id);
      const mine = (await poster.getFeed({ space: h.spaceId })).find((p) => p.post_id === id)!;
      expect(mine.seen_count).toBe(1);
    });
  });

  describe('BETA-REPLY-1 hearts', () => {
    it('a viewer toggles a heart in one call and the count follows', async () => {
      const id = await publishedPost();
      expect(await viewerIn.toggleHeart(id)).toEqual({ i_hearted: true, heart_count: 1 });
      const seen = (await viewerIn.getFeed({ space: h.spaceId })).find((p) => p.post_id === id)!;
      expect(seen).toMatchObject({ i_hearted: true, heart_count: 1 });
      expect(await viewerIn.toggleHeart(id)).toEqual({ i_hearted: false, heart_count: 0 });
    });
  });

  describe('BETA-REPLY-2 comments', () => {
    it('trimmed body must be 1–500 characters (23514)', async () => {
      const id = await publishedPost();
      expect(await code(viewerIn.addComment({ clientId: uuid(), post: id, body: '   ' }))).toBe('23514');
      expect(await code(viewerIn.addComment({ clientId: uuid(), post: id, body: 'x'.repeat(501) }))).toBe('23514');
      expect(await code(viewerIn.addComment({ clientId: uuid(), post: id, body: '  ' + 'x'.repeat(500) + '  ' }))).toBe('ok');
    });

    it('idempotent on p_client_id, oldest first, visible to the audience only', async () => {
      const id = await publishedPost();
      const clientId = uuid();
      const a = await viewerIn.addComment({ clientId, post: id, body: 'So cute!' });
      const b = await viewerIn.addComment({ clientId, post: id, body: 'So cute!' });
      expect(b.comment_id).toBe(a.comment_id);
      await poster.addComment({ clientId: uuid(), post: id, body: 'Thanks Mom' });
      const list = await poster.getComments(id);
      expect(list.map((c) => c.body)).toEqual(['So cute!', 'Thanks Mom']);
      expect(list[0]).toMatchObject({ author_id: expect.any(String), author_name: expect.any(String), created_at: expect.any(String) });
      const feed = (await viewerIn.getFeed({ space: h.spaceId })).find((p) => p.post_id === id)!;
      expect(feed.comment_count).toBe(2);
    });
  });

  describe('BETA-AUD-5 delete', () => {
    it('only the author can delete; it vanishes from every feed; repeat is a no-op', async () => {
      const id = await publishedPost();
      expect(['42501', 'P0002']).toContain(await code(viewerIn.deletePost(id)));
      expect(await feedIds(viewerIn)).toContain(id);
      await poster.deletePost(id);
      await poster.deletePost(id);
      expect(await feedIds(poster)).not.toContain(id);
      expect(await feedIds(viewerIn)).not.toContain(id);
      expect(await code(viewerIn.toggleHeart(id))).toBe('P0002');
    });
  });

  describe('get_feed keyset pagination', () => {
    it('newest first, no gaps or duplicates across pages, limit capped at 50', async () => {
      const made: string[] = [];
      for (let i = 0; i < 25; i++) made.push(await publishedPost(`p${i}`));
      const p1 = await viewerIn.getFeed({ space: h.spaceId, limit: 10 });
      expect(p1).toHaveLength(10);
      const last = p1[p1.length - 1]!;
      const p2 = await viewerIn.getFeed({ space: h.spaceId, limit: 10, beforeTs: last.published_at, beforeId: last.post_id });
      const all = [...p1, ...p2].map((p) => p.post_id);
      expect(new Set(all).size).toBe(20);
      expect(all.slice(0, 20)).toEqual([...made].reverse().slice(0, 20));
      for (let i = 1; i < p1.length; i++) {
        expect(p1[i - 1]!.published_at >= p1[i]!.published_at).toBe(true);
      }
      const big = await viewerIn.getFeed({ space: h.spaceId, limit: 500 });
      expect(big.length).toBeLessThanOrEqual(50);
    });
  });

  describe('invites (BETA-JOIN-1, -3, -4)', () => {
    it('viewers cannot create invites (42501)', async () => {
      expect(await code(viewerIn.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], history: 'all' }))).toBe('42501');
    });

    it('preview works signed out and leaks only inviter and space name', async () => {
      const { code: c, link } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], history: 'all' });
      expect(link).toMatch(/^https:\/\//); // may carry a separate link token rather than the code
      const prev = await h.anon().invitePreview(c);
      expect(Object.keys(prev).sort()).toEqual(['inviter_name', 'space_name']);
      expect(await code(h.anon().invitePreview('NOPE-NOPE-1'))).toBe('22023');
    });

    it('ONB-3/ONB-4 the link is the web build\'s /join/ address, and its last segment previews signed out', async () => {
      const { link } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], history: 'all' });
      expect(link.startsWith(JOIN_LINK_BASE)).toBe(true);
      const segment = link.slice(JOIN_LINK_BASE.length); // the code (Fake) or the 160-bit link token (server)
      expect(segment).toMatch(/^[A-Za-z0-9]+$/);
      expect((await h.anon().invitePreview(segment)).inviter_name).toBeTruthy();
    });

    itJoiner('a bad code is 22023 with no space data', async () => {
      expect(await code(h.as('joiner').redeemInvite('ZZZZZZZZZZ'))).toBe('22023');
    });

    itJoiner('redeeming places the person in the invite circles, once', async () => {
      const id = await publishedPost('for the joiner');
      const { code: c } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], history: 'all', channel: 'email', targetEmail: h.joinerEmail });
      const joiner = h.as('joiner');
      expect(await joiner.redeemInvite(c)).toBe(h.spaceId);
      expect(await feedIds(joiner)).toContain(id);
      expect(await code(joiner.redeemInvite(c))).toBe('22023'); // already used
    });

    itJoiner('GRP-12 / PRIV-G2: one invite can name two groups; the joiner gets both', async () => {
      const inId = await publishedPost('to the in group');
      const outId = await publishedPost('to the out group', [h.circleOut]);
      const { code: c } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn, h.circleOut], history: 'all', channel: 'email', targetEmail: h.joinerEmail });
      const joiner = h.as('joiner');
      expect(await joiner.redeemInvite(c)).toBe(h.spaceId);
      const ids = await feedIds(joiner);
      expect(ids).toContain(inId);
      expect(ids).toContain(outId);
    });

    itJoiner('an invite addressed to someone else is refused (22023)', async () => {
      const { code: c } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], history: 'all', channel: 'email', targetEmail: 'someone.else@example.com' });
      expect(await code(h.as('joiner').redeemInvite(c))).toBe('22023');
    });

    itRate('S10: 10 failures in 10 minutes, then 54000 even for a good code', async () => {
      const rl = h.as('ratelimit');
      for (let i = 0; i < 10; i++) expect(await code(rl.redeemInvite(`BAD${i}BAD${i}XX`))).toBe('22023');
      const { code: good } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], history: 'all' });
      expect(await code(rl.redeemInvite(good))).toBe('54000');
    });
  });

  describe('sign-media (BETA-SHARE-2, -3, BETA-AUD-3)', () => {
    const item = (n: number, t: number, exif = true) => ({
      kind: 'photo' as const, mime_type: 'image/jpeg', width: 2048, height: 1536, duration_ms: null,
      byte_size: encryptedSize(n), thumb_byte_size: encryptedSize(t), exif_stripped: exif,
    });

    itMedia('refuses an upload not marked exif_stripped (EXIF / 422)', async () => {
      const id = await poster.createPost({ clientId: uuid(), space: h.spaceId, caption: null, circleIds: [h.circleIn] });
      expect(await code(poster.signUpload(id, [item(10, 5, false)]))).toBe('EXIF');
    });

    itMedia('full order works; audience decrypts; outsider gets P0002; publish waits for ready media', async () => {
      const display = new Uint8Array(5000).map((_, i) => i & 0xff);
      const thumb = new Uint8Array(900).map((_, i) => (i * 7) & 0xff);
      const id = await poster.createPost({ clientId: uuid(), space: h.spaceId, caption: 'with media', circleIds: [h.circleIn] });
      const grant = await poster.signUpload(id, [item(display.length, thumb.length)]);
      const g = grant.items[0]!;
      expect(g.enc_scheme).toBe('aes-256-gcm-chunked-v1');
      expect(await code(poster.publishPost(id))).not.toBe('ok'); // media not ready yet
      await poster.putObject(g.display_put_url, encryptMedia(display, g.dek), g.required_headers);
      await poster.putObject(g.thumb_put_url, encryptMedia(thumb, g.dek), g.required_headers);
      expect(await poster.finalizeMedia([g.media_id])).toEqual([{ media_id: g.media_id, ok: true }]);
      await poster.publishPost(id);

      const view = await viewerIn.signView(id);
      const v = view.items[0]!;
      expect(v.id).toBe(g.media_id);
      const bytes = await viewerIn.getObject(v.display_url);
      // Stored bytes are ciphertext: no run of the plaintext appears in them. (Was `bytes[0] !== 0`, which
      // failed 1 run in 256 because byte 0 is the random nonce prefix.)
      expect(Buffer.from(bytes).includes(Buffer.from(display.subarray(0, 64)))).toBe(false);
      expect(Buffer.from(decryptMedia(bytes, v.dek))).toEqual(Buffer.from(display));
      expect(await code(viewerOut.signView(id))).toBe('P0002');
      const fp = (await viewerIn.getFeed({ space: h.spaceId })).find((p) => p.post_id === id)!;
      expect(fp.media).toEqual([expect.objectContaining({ media_id: g.media_id, kind: 'photo', status: 'ready', width: 2048, height: 1536 })]);
    });

    itMedia('finalize reports a wrong-size object as not ok', async () => {
      const id = await poster.createPost({ clientId: uuid(), space: h.spaceId, caption: null, circleIds: [h.circleIn] });
      const g = (await poster.signUpload(id, [item(100, 50)])).items[0]!;
      await poster.putObject(g.display_put_url, new Uint8Array(3), g.required_headers);
      await poster.putObject(g.thumb_put_url, encryptMedia(new Uint8Array(50), g.dek), g.required_headers);
      expect(await poster.finalizeMedia([g.media_id])).toEqual([{ media_id: g.media_id, ok: false }]);
    });

    itMedia('viewers cannot upload (42501)', async () => {
      const id = await publishedPost();
      expect(['42501', 'P0002']).toContain(await code(viewerIn.signUpload(id, [item(10, 5)])));
    });
  });

  describe('register_push_token / set_notification_prefs (AE-2)', () => {
    it('AE-2: a member saves her phone token; saving it again is fine', async () => {
      expect(await code(viewerIn.registerPushToken('ExponentPushToken[contract-a]', 'android'))).toBe('ok');
      expect(await code(viewerIn.registerPushToken('ExponentPushToken[contract-a]', 'android'))).toBe('ok');
    });

    it('AE-2: a malformed token or unknown platform is 23514', async () => {
      expect(await code(viewerIn.registerPushToken('not-a-token', 'ios'))).toBe('23514');
      expect(await code(viewerIn.registerPushToken('ExponentPushToken[x]', 'fax' as never))).toBe('23514');
    });

    it('AE-2: signed out cannot save a token (42501)', async () => {
      expect(await code(h.anon().registerPushToken('ExponentPushToken[y]', 'ios'))).toBe('42501');
    });

    it('BETA-NOTIFY-5: a member saves push off + daily email for her space', async () => {
      expect(await code(viewerIn.setNotificationPrefs(h.spaceId, { push: false, emailDigest: 'daily' }))).toBe('ok');
      expect(await code(viewerIn.setNotificationPrefs(h.spaceId, { push: true, emailDigest: 'off' }))).toBe('ok');
    });

    it('BETA-NOTIFY-5: an unknown email choice is 23514', async () => {
      expect(await code(viewerIn.setNotificationPrefs(h.spaceId, { push: true, emailDigest: 'hourly' as never }))).toBe('23514');
    });

    it('AE-2: a space you are not in behaves as not found (P0002)', async () => {
      expect(await code(viewerIn.setNotificationPrefs('99999999-0000-0000-0000-000000000099', { push: true, emailDigest: 'off' }))).toBe('P0002');
    });
  });

  describe('report_client_error (BETA-OPS-1)', () => {
    it('BETA-OPS-1: signed in or not, a fixed-shape error report is accepted', async () => {
      const r = { appVersion: '0.1.0', os: 'ios 18.1', screen: 'photos', kind: 'TypeError' };
      expect(await code(viewerIn.reportClientError(r))).toBe('ok');
      expect(await code(h.anon().reportClientError({ ...r, kind: 'ApiError', code: 'P0002' }))).toBe('ok');
    });

    it('BETA-OPS-1: free text (a caption or URL) is refused with 23514', async () => {
      expect(await code(viewerIn.reportClientError({ appVersion: '0.1.0', os: 'ios', screen: 'photos', kind: 'Mia at the park' }))).toBe('23514');
      expect(await code(viewerIn.reportClientError({ appVersion: '0.1.0', os: 'ios', screen: 'https://x.y/z', kind: 'TypeError' }))).toBe('23514');
    });
  });

  describe('set_my_name / my_profile / create_invite p_name (BETA-NOTIFY-7, JOIN-1)', () => {
    it('BETA-NOTIFY-7: a poster sets the name the family knows them by', async () => {
      expect(await code(poster.setMyName('  Chase  '))).toBe('ok');
      expect(await poster.myProfile()).toMatchObject({ display_name: 'Chase', name_set: true });
    });

    it('BETA-NOTIFY-7: empty, email-like, too long or bracketed names are 23514', async () => {
      for (const bad of ['', 'chase@example.com', 'x'.repeat(41), 'Chase <x@y.z>']) {
        expect(await code(poster.setMyName(bad))).toBe('23514');
      }
    });

    it('JOIN-1: an invite can carry the name the family uses; an email-like one is 23514', async () => {
      expect(await code(poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], history: 'all', name: 'Grandma June' }))).toBe('ok');
      expect(await code(poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], history: 'all', name: 'june@example.com' }))).toBe('23514');
    });

    itJoiner('JOIN-1: joining gives a person with no chosen name the name on the invite', async () => {
      const { code: c } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], history: 'all', channel: 'email', targetEmail: h.joinerEmail, name: 'Grandma June' });
      const joiner = h.as('joiner');
      const before = await joiner.myProfile();
      await joiner.redeemInvite(c);
      const after = await joiner.myProfile();
      expect(after.name_set).toBe(true);
      expect(after.display_name).toBe(before.name_set ? before.display_name : 'Grandma June');
    });

    it('names: signed out cannot set a name (42501)', async () => {
      expect(await code(h.anon().setMyName('X'))).toBe('42501');
    });
  });

  describe('rename_circle (MILESTONE-1 group renames)', () => {
    it('a poster renames a group; the name comes back trimmed', async () => {
      expect(await code(poster.renameCircle(h.circleIn, '  Dad\'s parents  '))).toBe('ok');
      expect((await poster.myCircles(h.spaceId)).find((c) => c.circle_id === h.circleIn)?.name).toBe("Dad's parents");
    });

    it("a name another group has is 23514; empty is 23514", async () => {
      const other = (await poster.myCircles(h.spaceId)).find((c) => c.circle_id !== h.circleIn)!;
      expect(await code(poster.renameCircle(h.circleIn, other.name))).toBe('23514');
      expect(await code(poster.renameCircle(h.circleIn, '  '))).toBe('23514');
    });

    it('a viewer gets not found (P0002), even for a group she is in', async () => {
      expect(await code(viewerIn.renameCircle(h.circleIn, 'Mine now'))).toBe('P0002');
    });
  });

  describe('request_account_deletion (BETA-JOIN-7)', () => {
    itJoiner('BETA-JOIN-7: a member who deletes their account is out of every space', async () => {
      const { code: c } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], history: 'all', channel: 'email', targetEmail: h.joinerEmail });
      const joiner = h.as('joiner');
      await joiner.redeemInvite(c);
      expect((await joiner.mySpaces()).length).toBeGreaterThan(0);
      expect(await code(joiner.requestAccountDeletion())).toBe('ok');
      expect(await joiner.mySpaces()).toEqual([]);
    });

    it('BETA-JOIN-7: signed out cannot request a deletion (42501)', async () => {
      expect(await code(h.anon().requestAccountDeletion())).toBe('42501');
    });
  });

  describe('who reads replies (BETA-AUD-8/9/10)', () => {
    it("BETA-AUD-8: a viewer's comment is read by the parent; the app is told it reaches only the parents", async () => {
      const id = await publishedPost('reply rule');
      await viewerIn.addComment({ clientId: uuid(), post: id, body: 'Look at him go!' });
      expect((await poster.getComments(id)).map((c) => c.body)).toContain('Look at him go!');
      const mine = (await viewerIn.getFeed({ space: h.spaceId, limit: 50 })).find((p) => p.post_id === id)!;
      expect(mine.reply_scope).toBe('parents');
      const theirs = (await poster.getFeed({ space: h.spaceId, limit: 50 })).find((p) => p.post_id === id)!;
      expect(theirs.reply_scope).toBe('everyone');
    });

    it('BETA-REPLY-12: the per-group switch is gone; containers report their kind', async () => {
      expect((poster as unknown as Record<string, unknown>).setGroupRepliesShared).toBeUndefined();
      const mine = (await poster.myCircles(h.spaceId)).find((c) => c.circle_id === h.circleIn)!;
      expect(mine).not.toHaveProperty('replies_shared');
      expect(['everyone', 'group', 'household', 'event']).toContain(mine.kind);
    });

    it('BETA-REPLY-11: reply_readers names who will read my reply; null for a post I cannot see', async () => {
      const id = await publishedPost('who reads');
      const names = await viewerIn.replyReaders(id);
      expect(Array.isArray(names)).toBe(true);
      expect(names!.length).toBeGreaterThan(0);
      expect(await viewerOut.replyReaders(id)).toBeNull();
    });

    it('BETA-AUD-10: only the owner changes the family default; an unknown choice is 23514', async () => {
      expect(await code(viewerIn.setReplyAudience(h.spaceId, 'everyone'))).toBe('42501');
      expect(await code(poster.setReplyAudience(h.spaceId, 'sometimes' as never))).toBe('23514');
      expect(await code(poster.setReplyAudience(h.spaceId, 'everyone'))).toBe('ok');
      expect((await poster.mySpaces()).find((s) => s.space_id === h.spaceId)?.reply_audience).toBe('everyone');
      expect(await code(poster.setReplyAudience(h.spaceId, 'parents'))).toBe('ok');
    });
  });
  describe('get_timeline / get_timeline_years (BETA-TIME-2..4, migration 0010)', () => {
    async function datedPost(takenAt: string | null, circles = [h.circleIn], caption = 'dated'): Promise<string> {
      const id = await poster.createPost({ clientId: uuid(), space: h.spaceId, caption, circleIds: circles, takenAt });
      await h.attachReadyMedia(poster, id);
      await poster.publishPost(id);
      return id;
    }
    const tlIds = async (api: HearthApi) => (await api.getTimeline({ space: h.spaceId, limit: 50 })).map((p) => p.post_id);

    it('BETA-TIME-2 orders by date taken (shared date when none), newest first; rows carry taken_at and sort_at', async () => {
      const old = await datedPost('2024-07-04T14:00:00.000Z');
      const mid = await datedPost('2025-12-25T18:00:00.000Z');
      const undated = await datedPost(null);
      const ids = (await tlIds(viewerIn)).filter((i) => [old, mid, undated].includes(i));
      expect(ids).toEqual([undated, mid, old]);
      const rows = await viewerIn.getTimeline({ space: h.spaceId, limit: 50 });
      const o = rows.find((r) => r.post_id === old)!;
      expect(o.taken_at && new Date(o.taken_at).toISOString()).toBe('2024-07-04T14:00:00.000Z');
      expect(new Date(o.sort_at).toISOString()).toBe('2024-07-04T14:00:00.000Z');
      const u = rows.find((r) => r.post_id === undated)!;
      expect(u.taken_at).toBeNull();
      expect(u.sort_at).toBe(u.published_at);
    });

    it('BETA-TIME-1 feed rows carry taken_at (for the "Added from earlier" card); null when none', async () => {
      const old = await datedPost('2024-07-04T14:00:00.000Z');
      const undated = await datedPost(null);
      const rows = await viewerIn.getFeed({ space: h.spaceId, limit: 50 });
      const o = rows.find((r) => r.post_id === old)!;
      expect(o.taken_at && new Date(o.taken_at).toISOString()).toBe('2024-07-04T14:00:00.000Z');
      expect(rows.find((r) => r.post_id === undated)!.taken_at).toBeNull();
    });

    it('BETA-TIME-1 the feed is unchanged: still newest shared first', async () => {
      const a = await datedPost('2020-01-01T12:00:00.000Z');
      const b = await datedPost('2025-01-01T12:00:00.000Z');
      const ids = (await feedIds(viewerIn)).filter((i) => [a, b].includes(i));
      expect(ids).toEqual([b, a]);
      const tl = (await tlIds(viewerIn)).filter((i) => [a, b].includes(i));
      expect(tl).toEqual([b, a]);
      const c = await datedPost('2019-06-01T12:00:00.000Z');
      expect((await feedIds(viewerIn))[0]).toBe(c);
      expect((await tlIds(viewerIn)).indexOf(c)).toBeGreaterThan((await tlIds(viewerIn)).indexOf(a));
    });

    it('BETA-TIME-2 keyset pages: no gaps or duplicates, limit capped at 50', async () => {
      for (let i = 0; i < 5; i++) await datedPost(`2023-0${i + 1}-15T12:00:00.000Z`);
      const all = await tlIds(viewerIn);
      const seen: string[] = [];
      let beforeAt: string | null = null, beforeId: string | null = null;
      for (let guard = 0; guard < 30; guard++) {
        const page = await viewerIn.getTimeline({ space: h.spaceId, limit: 2, beforeAt, beforeId });
        seen.push(...page.map((p) => p.post_id));
        if (page.length < 2) break;
        beforeAt = page[page.length - 1]!.sort_at; beforeId = page[page.length - 1]!.post_id;
      }
      expect(seen).toEqual(all);
      expect(new Set(seen).size).toBe(seen.length);
      expect((await viewerIn.getTimeline({ space: h.spaceId, limit: 500 })).length).toBeLessThanOrEqual(50);
    });

    it('BETA-TIME-3 a hidden post is simply absent: the allowed person sees it, the excluded one never does', async () => {
      const id = await datedPost('2024-07-04T14:00:00.000Z', [h.circleIn], 'only for circleIn');
      expect(await tlIds(viewerIn)).toContain(id);
      expect(await tlIds(poster)).toContain(id);
      expect(await tlIds(viewerOut)).not.toContain(id);
      const yearsIn = await viewerIn.getTimelineYears(h.spaceId, 'America/New_York');
      const yearsOut = await viewerOut.getTimelineYears(h.spaceId, 'America/New_York');
      expect(yearsIn.find((y) => y.year === 2024)?.post_count ?? 0).toBeGreaterThanOrEqual(1);
      expect(yearsOut.find((y) => y.year === 2024)).toBeUndefined();
    });

    it('BETA-TIME-3 drafts and deleted posts never appear', async () => {
      const draft = await poster.createPost({ clientId: uuid(), space: h.spaceId, caption: 'draft', circleIds: [h.circleIn], takenAt: '2022-02-02T12:00:00.000Z' });
      const gone = await datedPost('2022-03-03T12:00:00.000Z');
      await poster.deletePost(gone);
      for (const api of [poster, viewerIn]) {
        const ids = await tlIds(api);
        expect(ids).not.toContain(draft);
        expect(ids).not.toContain(gone);
      }
    });

    it('BETA-TIME-4 years, newest first, with post and photo counts; the year follows the phone time zone', async () => {
      await datedPost('2021-05-01T12:00:00.000Z');
      await datedPost('2021-06-01T12:00:00.000Z');
      // T7: years no other test uses, since the real-API harness keeps one database for the whole run
      // (BETA-TIME-2 above makes a 2019 post).
      await datedPost('2017-01-01T03:30:00.000Z'); // 10:30 pm Dec 31 2016 in New York
      const ny = await viewerIn.getTimelineYears(h.spaceId, 'America/New_York');
      expect(ny.map((y) => y.year)).toEqual([...ny.map((y) => y.year)].sort((a, b) => b - a));
      expect(ny.find((y) => y.year === 2021)).toMatchObject({ post_count: 2, photo_count: 2 });
      expect(ny.find((y) => y.year === 2016)).toMatchObject({ post_count: 1 });
      expect(ny.find((y) => y.year === 2017)).toBeUndefined();
      const utc = await viewerIn.getTimelineYears(h.spaceId, 'UTC');
      expect(utc.find((y) => y.year === 2017)).toMatchObject({ post_count: 1 });
    });

    it('BETA-TIME-4 an unknown time zone is 22023', async () => {
      expect(await code(viewerIn.getTimelineYears(h.spaceId, 'Mars/Olympus'))).toBe('22023');
    });

    it('BETA-BULK-6 create_post: batch id and size go together; a batch is 1-100 posts (23514)', async () => {
      expect(await code(poster.createPost({ clientId: uuid(), space: h.spaceId, caption: null, circleIds: [h.circleIn], batchId: uuid() }))).toBe('23514');
      expect(await code(poster.createPost({ clientId: uuid(), space: h.spaceId, caption: null, circleIds: [h.circleIn], batchSize: 3 }))).toBe('23514');
      expect(await code(poster.createPost({ clientId: uuid(), space: h.spaceId, caption: null, circleIds: [h.circleIn], batchId: uuid(), batchSize: 101 }))).toBe('23514');
      expect(await code(poster.createPost({ clientId: uuid(), space: h.spaceId, caption: null, circleIds: [h.circleIn], batchId: uuid(), batchSize: 5, takenAt: '2024-07-04T14:00:00.000Z' }))).toBe('ok');
    });
  });
  describe('groups v2 (SPEC-GROUPS v2, migration 0013)', () => {
    const fresh = (what: string) => `${what} ${uuid().slice(0, 8)}`;
    const mineIn = async (id: string) => (await poster.myCircles(h.spaceId)).find((c) => c.circle_id === id);

    it('GRP-15 create_level: a group starts Private, an event Shared on its posts; relatives get P0002; Everyone is 23514', async () => {
      const g = await poster.createLevel(h.spaceId, 'group', fresh('Contract group'));
      const e = await poster.createLevel(h.spaceId, 'event', fresh('Contract event'));
      expect(await mineIn(g)).toMatchObject({ kind: 'group', comment_mode: 'private', member_count: 0 });
      expect(await mineIn(e)).toMatchObject({ kind: 'event', comment_mode: 'on_group_posts' });
      expect(await code(viewerIn.createLevel(h.spaceId, 'group', fresh('Nope')))).toBe('P0002');
      expect(await code(poster.createLevel(h.spaceId, 'everyone' as never, fresh('Nope')))).toBe('23514');
      expect(await code(poster.createLevel(h.spaceId, 'group', '   '))).toBe('23514');
    });

    it('GRP-17 set_comment_mode: parents set the three values; anything else 23514; Everyone 23514; relatives P0002', async () => {
      const g = await poster.createLevel(h.spaceId, 'group', fresh('Mode group'));
      expect(await code(poster.setCommentMode(g, 'always'))).toBe('ok');
      expect((await mineIn(g))?.comment_mode).toBe('always');
      expect(await code(poster.setCommentMode(g, 'on_group_posts'))).toBe('ok');
      expect(await code(poster.setCommentMode(g, 'sometimes' as never))).toBe('23514');
      expect(await code(viewerIn.setCommentMode(g, 'private'))).toBe('P0002');
      // the seed loads after the migrations, so a stack may have no kind-'everyone' row (the SQL suite covers it there)
      const everyone = (await poster.myCircles(h.spaceId)).find((c) => c.kind === 'everyone');
      if (everyone) expect(await code(poster.setCommentMode(everyone.circle_id, 'always'))).toBe('23514');
    });

    it('GRP-15 place_person: a relative goes into any group with a share-history choice; none is 23514; Everyone 23514', async () => {
      const g = await poster.createLevel(h.spaceId, 'group', fresh('Place group'));
      const out = await viewerOut.myProfile();
      expect(await code(poster.placePerson(g, out.user_id, null as never))).toBe('23514');
      expect(await code(poster.placePerson(g, out.user_id, 'all'))).toBe('ok');
      expect(await mineIn(g)).toMatchObject({ member_count: 1, member_names: [out.display_name] });
      const everyone = (await poster.myCircles(h.spaceId)).find((c) => c.kind === 'everyone');
      if (everyone) expect(await code(poster.placePerson(everyone.circle_id, out.user_id, 'all'))).toBe('23514');
      expect(await code(viewerIn.placePerson(g, out.user_id, 'all'))).toBe('P0002');
    });

    it('GRP-16 add_people_from copies the relatives once (not linked); relatives P0002', async () => {
      const src = await poster.createLevel(h.spaceId, 'group', fresh('Source side'));
      const target = await poster.createLevel(h.spaceId, 'event', fresh('Birthday'));
      const inP = await viewerIn.myProfile();
      const outP = await viewerOut.myProfile();
      await poster.placePerson(src, inP.user_id, 'all');
      expect(await code(poster.addPeopleFrom(target, src, 'new'))).toBe('ok');
      expect((await mineIn(target))?.member_names).toEqual([inP.display_name]);
      await poster.placePerson(src, outP.user_id, 'all');
      expect((await mineIn(target))?.member_names).toEqual([inP.display_name]); // copied once, not linked
      expect(await code(poster.addPeopleFrom(target, src, null as never))).toBe('23514');
      expect(await code(viewerIn.addPeopleFrom(target, src, 'all'))).toBe('P0002');
    });

    it('GRP-15 family_people: a parent lists everyone in the family with ids; a relative never sees another relative', async () => {
      const inP = await viewerIn.myProfile();
      const outP = await viewerOut.myProfile();
      const all = await poster.familyPeople(h.spaceId);
      expect(all).toEqual(expect.arrayContaining([
        { user_id: inP.user_id, name: inP.display_name, role: 'viewer' },
        { user_id: outP.user_id, name: outP.display_name, role: 'viewer' },
      ]));
      const seen = (await viewerIn.familyPeople(h.spaceId)).map((p) => p.user_id);
      expect(seen).not.toContain(outP.user_id);
    });

    it('EVT-1 feed and timeline rows carry the event id and name for its members and parents; others get nulls', async () => {
      const name = fresh("Chase's birthday");
      const e = await poster.createLevel(h.spaceId, 'event', name);
      await poster.placePerson(e, (await viewerIn.myProfile()).user_id, 'all');
      const id = await publishedPost('Cake', [e, h.circleOut]);
      const feedRow = async (api: HearthApi) => (await api.getFeed({ space: h.spaceId, limit: 50 })).find((p) => p.post_id === id);
      expect(await feedRow(viewerIn)).toMatchObject({ event_id: e, event_name: name });
      expect(await feedRow(poster)).toMatchObject({ event_id: e, event_name: name });
      const out = await feedRow(viewerOut);
      expect(out).toMatchObject({ event_id: null, event_name: null });
      expect(JSON.stringify(out)).not.toContain(name);
      const tl = (await viewerIn.getTimeline({ space: h.spaceId, limit: 50 })).find((p) => p.post_id === id);
      expect(tl).toMatchObject({ event_id: e, event_name: name });
    });

    it('FLAG-5 my_features: video off by default for everyone (FLAG-1); a list of names', async () => {
      expect(await poster.myFeatures(h.spaceId)).not.toContain('video_posting');
      expect(await viewerIn.myFeatures(h.spaceId)).toEqual([]);
    });

    it('HELP-R4 my_features: the photo helpers are on by default for a poster, never for a viewer', async () => {
      expect(await poster.myFeatures(h.spaceId)).toEqual(expect.arrayContaining(['photo_helpers_duplicates', 'photo_helpers_screens_blur']));
      expect(await viewerIn.myFeatures(h.spaceId)).toEqual([]);
    });
  });
});
