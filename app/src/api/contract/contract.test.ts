// API.md contract tests. They run against every HearthApi implementation we can reach:
// FakeApi always; SupabaseApi when HEARTH_API_URL/HEARTH_ANON_KEY/HEARTH_USERS_JSON are set.
import { ApiError, type HearthApi } from '../HearthApi';
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
      expect(await code(viewerIn.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn] }))).toBe('42501');
    });

    it('preview works signed out and leaks only inviter and space name', async () => {
      const { code: c, link } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn] });
      expect(link).toMatch(/^https:\/\//); // may carry a separate link token rather than the code
      const prev = await h.anon().invitePreview(c);
      expect(Object.keys(prev).sort()).toEqual(['inviter_name', 'space_name']);
      expect(await code(h.anon().invitePreview('NOPE-NOPE-1'))).toBe('22023');
    });

    itJoiner('a bad code is 22023 with no space data', async () => {
      expect(await code(h.as('joiner').redeemInvite('ZZZZZZZZZZ'))).toBe('22023');
    });

    itJoiner('redeeming places the person in the invite circles, once', async () => {
      const id = await publishedPost('for the joiner');
      const { code: c } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], channel: 'email', targetEmail: h.joinerEmail });
      const joiner = h.as('joiner');
      expect(await joiner.redeemInvite(c)).toBe(h.spaceId);
      expect(await feedIds(joiner)).toContain(id);
      expect(await code(joiner.redeemInvite(c))).toBe('22023'); // already used
    });

    itJoiner('an invite addressed to someone else is refused (22023)', async () => {
      const { code: c } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], channel: 'email', targetEmail: 'someone.else@example.com' });
      expect(await code(h.as('joiner').redeemInvite(c))).toBe('22023');
    });

    itRate('S10: 10 failures in 10 minutes, then 54000 even for a good code', async () => {
      const rl = h.as('ratelimit');
      for (let i = 0; i < 10; i++) expect(await code(rl.redeemInvite(`BAD${i}BAD${i}XX`))).toBe('22023');
      const { code: good } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn] });
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
      expect(bytes[0]).not.toBe(0); // stored bytes are ciphertext
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
      expect(await code(poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], name: 'Grandma June' }))).toBe('ok');
      expect(await code(poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], name: 'june@example.com' }))).toBe('23514');
    });

    itJoiner('JOIN-1: joining gives a person with no chosen name the name on the invite', async () => {
      const { code: c } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], channel: 'email', targetEmail: h.joinerEmail, name: 'Grandma June' });
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
      const { code: c } = await poster.createInvite({ space: h.spaceId, role: 'viewer', circleIds: [h.circleIn], channel: 'email', targetEmail: h.joinerEmail });
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

    it('BETA-AUD-9: posters flip "members see each other\'s replies" on a group; viewers get not found', async () => {
      expect(await code(poster.setGroupRepliesShared(h.circleIn, true))).toBe('ok');
      expect((await poster.myCircles(h.spaceId)).find((c) => c.circle_id === h.circleIn)?.replies_shared).toBe(true);
      expect(await code(viewerIn.setGroupRepliesShared(h.circleIn, false))).toBe('P0002');
      expect(await code(poster.setGroupRepliesShared(h.circleIn, false))).toBe('ok');
    });

    it('BETA-AUD-10: only the owner changes the family default; an unknown choice is 23514', async () => {
      expect(await code(viewerIn.setReplyAudience(h.spaceId, 'everyone'))).toBe('42501');
      expect(await code(poster.setReplyAudience(h.spaceId, 'sometimes' as never))).toBe('23514');
      expect(await code(poster.setReplyAudience(h.spaceId, 'everyone'))).toBe('ok');
      expect((await poster.mySpaces()).find((s) => s.space_id === h.spaceId)?.reply_audience).toBe('everyone');
      expect(await code(poster.setReplyAudience(h.spaceId, 'parents'))).toBe('ok');
    });
  });
});
