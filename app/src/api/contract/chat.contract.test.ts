// Messenger relay contract (docs/product/SPEC-MESSENGER.md, migration 0015). Same cast as contract.test.ts:
// FakeApi always; SupabaseApi when the env is set. Bodies are opaque base64 here; the MLS side is src/messenger.
import { ApiError, type HearthApi } from '../HearthApi';
import { fakeHarness } from './fakeHarness';
import type { ContractHarness, HarnessFactory } from './harness';
import { supabaseEnvReady, supabaseHarness } from './supabaseHarness';

const factories: [string, HarnessFactory][] = [['FakeApi', fakeHarness]];
if (supabaseEnvReady()) factories.push(['SupabaseApi', supabaseHarness]);

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ApiError ? e.code : `non-ApiError: ${String(e)}`;
  }
}
const b64 = (s: string) => Buffer.from(s).toString('base64');

describe.each(factories)('%s messenger contract (MSG)', (_name, factory) => {
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

  it('MSG-2: someone outside the group gets "not found" for every chat call', async () => {
    const c = h.circleIn;
    expect(await code(viewerOut.chatStart(c))).toBe('P0002');
    expect(await code(viewerOut.chatFetch(c, 0))).toBe('P0002');
    expect(await code(viewerOut.chatSend(c, 'message', 0, b64('x')))).toBe('P0002');
    expect(await code(viewerOut.chatRoster(c))).toBe('P0002');
    expect(await code(viewerOut.chatClaim(c, []))).toBe('P0002');
    expect((await viewerOut.chatList(h.spaceId)).map((x) => x.circle_id)).not.toContain(c);
  });

  it('MSG-1/5/6: start, roster, claim, one commit per epoch, welcomes only to their person', async () => {
    const c = h.circleIn;
    const me = (await viewerIn.getSession())!.userId;
    await viewerIn.chatPublishDevice(b64('sig-viewer'), [b64('kp-viewer-1')]);
    await poster.chatPublishDevice(b64('sig-poster'), [b64('kp-poster-1')]);
    expect(await viewerIn.chatKeyPackageCount()).toBe(1);

    expect(await poster.chatStart(c)).toBe(true);
    expect(await viewerIn.chatStart(c)).toBe(false);

    const roster = await viewerIn.chatRoster(c);
    expect(roster.find((r) => r.user_id === me)?.signature_key).toBe(b64('sig-viewer'));
    expect(roster.length).toBeGreaterThanOrEqual(2);

    const claimed = await poster.chatClaim(c, [me]);
    expect(claimed).toEqual([{ user_id: me, key_package: b64('kp-viewer-1') }]);
    expect(await poster.chatClaim(c, [me])).toEqual([]);

    const commitId = await poster.chatSend(c, 'commit', 0, b64('commit'));
    expect(commitId).toBeGreaterThan(0);
    expect(await code(viewerIn.chatSend(c, 'commit', 0, b64('other commit')))).toBe('23505');
    await poster.chatSend(c, 'welcome', 0, b64('welcome'), me);
    await poster.chatSend(c, 'message', 1, b64('sealed'));

    const rows = await viewerIn.chatFetch(c, 0);
    expect(rows.map((r) => r.kind)).toEqual(['commit', 'welcome', 'message']);
    expect(rows[2]!.body).toBe(b64('sealed'));
    expect(rows[2]!.epoch).toBe(1);
    expect((await viewerIn.chatFetch(c, rows[1]!.id)).map((r) => r.kind)).toEqual(['message']);
    expect((await poster.chatFetch(c, 0)).map((r) => r.kind)).toEqual(['commit', 'message']);
  });

  it('T10 / MSG-3: someone added to a group later can\'t fetch the chat rows sent before they joined', async () => {
    const c = h.circleIn;
    expect(await poster.chatStart(c)).toBe(true);
    await poster.chatSend(c, 'message', 0, b64('before'));
    const newcomer = (await viewerOut.getSession())!.userId;
    await new Promise((r) => setTimeout(r, 20)); // the join is strictly later than the old row
    await poster.placePerson(c, newcomer, 'new');
    await new Promise((r) => setTimeout(r, 20));
    await poster.chatSend(c, 'message', 0, b64('after'));
    const seen = (await viewerOut.chatFetch(c, 0)).map((r) => r.body);
    expect(seen).toEqual([b64('after')]);
    expect((await poster.chatFetch(c, 0)).map((r) => r.body)).toEqual([b64('before'), b64('after')]);
  });

  it('MSG-1/AUD-14: a relative\'s list titles a group chat by its people; a parent\'s by its name', async () => {
    const mine = (await viewerIn.chatList(h.spaceId)).find((x) => x.circle_id === h.circleIn);
    expect(mine).toBeDefined();
    expect(mine!.kind).toBe('group');
    const parents = (await poster.chatList(h.spaceId)).find((x) => x.circle_id === h.circleIn);
    expect(parents).toBeDefined();
    expect(mine!.title).not.toBe(parents!.title);
    expect([mine!.named, parents!.named]).toEqual([false, true]);
  });
});
