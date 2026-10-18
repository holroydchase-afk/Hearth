// Groups v2 (SPEC-GROUPS v2, migration 0013): the new calls use the exact RPC names and p_* args from
// API.md, and the FakeBackend keeps the same rules (the contract run holds both to them).
import { FIXTURE, FakeBackend } from '../fake/FakeBackend';
import { ApiError } from '../HearthApi';
import { SupabaseApi } from '../SupabaseApi';

function mockClient(data: unknown = null) {
  const rpc = jest.fn(async () => ({ data, error: null }));
  return { rpc, auth: { getSession: jest.fn(async () => ({ data: { session: null } })) } };
}
const make = (c: ReturnType<typeof mockClient>) => new SupabaseApi({ url: 'https://x.supabase.co', anonKey: 'anon', client: c as never });

describe('GRP-15..17 / FLAG-5 SupabaseApi wiring', () => {
  it.each([
    ['createLevel', ['S', 'group', 'Chase\'s birthday'], 'create_level', { p_space: 'S', p_kind: 'group', p_name: 'Chase\'s birthday' }],
    ['setCommentMode', ['C', 'always'], 'set_comment_mode', { p_circle: 'C', p_mode: 'always' }],
    ['placePerson', ['C', 'U', 'all'], 'place_person', { p_group: 'C', p_user: 'U', p_history: 'all' }],
    ['addPeopleFrom', ['T', 'F', 'new'], 'add_people_from', { p_target: 'T', p_source: 'F', p_history: 'new' }],
    ['myFeatures', ['S'], 'my_features', { p_space: 'S' }],
  ] as const)('GRP-15 %s → %s', async (method, args, rpcName, rpcArgs) => {
    const c = mockClient(method === 'createLevel' ? 'new-id' : []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (make(c) as any)[method](...args);
    expect(c.rpc).toHaveBeenCalledWith(rpcName, rpcArgs);
  });

  it('FLAG-5 my_features rows become a list of feature names', async () => {
    const c = mockClient([{ feature: 'video_posting' }]);
    expect(await make(c).myFeatures('S')).toEqual(['video_posting']);
  });

  it('GRP-15 create_level returns the new id', async () => {
    expect(await make(mockClient('abc')).createLevel('S', 'event', 'Trip')).toBe('abc');
  });
});

describe('GRP-15..17 / FLAG-5 FakeBackend rules', () => {
  const chase = () => FakeBackend.withFixture();

  it('GRP-15 a new group starts Private and empty; an event starts Shared on its posts', async () => {
    const be = chase();
    const api = be.clientFor(FIXTURE.users.chase.id);
    const g = await api.createLevel(FIXTURE.space.id, 'group', 'Cousins');
    const e = await api.createLevel(FIXTURE.space.id, 'event', 'Beach week');
    const list = await api.myCircles(FIXTURE.space.id);
    expect(list.find((c) => c.circle_id === g)).toMatchObject({ name: 'Cousins', kind: 'group', comment_mode: 'private', member_count: 0 });
    expect(list.find((c) => c.circle_id === e)).toMatchObject({ kind: 'event', comment_mode: 'on_group_posts' });
  });

  it('GRP-15 a relative cannot make or change groups (P0002)', async () => {
    const api = chase().clientFor(FIXTURE.users.jo.id);
    await expect(api.createLevel(FIXTURE.space.id, 'group', 'Mine')).rejects.toMatchObject({ code: 'P0002' });
    await expect(api.setCommentMode(FIXTURE.circles.dadSide.id, 'always')).rejects.toMatchObject({ code: 'P0002' });
    await expect(api.placePerson(FIXTURE.circles.dadSide.id, FIXTURE.users.ruth.id, 'all')).rejects.toMatchObject({ code: 'P0002' });
    await expect(api.addPeopleFrom(FIXTURE.circles.dadSide.id, FIXTURE.circles.momSide.id, 'all')).rejects.toMatchObject({ code: 'P0002' });
  });

  it('GRP-17 set_comment_mode takes only the three values, never on Everyone (23514)', async () => {
    const api = chase().clientFor(FIXTURE.users.chase.id);
    await api.setCommentMode(FIXTURE.circles.dadSide.id, 'always');
    expect((await api.myCircles(FIXTURE.space.id)).find((c) => c.circle_id === FIXTURE.circles.dadSide.id)?.comment_mode).toBe('always');
    await expect(api.setCommentMode(FIXTURE.circles.dadSide.id, 'loud' as never)).rejects.toMatchObject({ code: '23514' });
    await expect(api.setCommentMode(FIXTURE.circles.everyone.id, 'always')).rejects.toMatchObject({ code: '23514' });
  });

  it('GRP-15 place_person needs a share-history choice and a live non-Everyone group', async () => {
    const api = chase().clientFor(FIXTURE.users.chase.id);
    const g = await api.createLevel(FIXTURE.space.id, 'group', 'Porch');
    await expect(api.placePerson(g, FIXTURE.users.ruth.id, null as never)).rejects.toBeInstanceOf(ApiError);
    await expect(api.placePerson(FIXTURE.circles.everyone.id, FIXTURE.users.ruth.id, 'all')).rejects.toMatchObject({ code: '23514' });
    await api.placePerson(g, FIXTURE.users.ruth.id, 'new');
    expect((await api.myCircles(FIXTURE.space.id)).find((c) => c.circle_id === g)?.member_names).toEqual(['Nana Ruth']);
  });

  it('GRP-16 add_people_from copies the relatives once, never the parents, and is not a link', async () => {
    const be = chase();
    const api = be.clientFor(FIXTURE.users.chase.id);
    const g = await api.createLevel(FIXTURE.space.id, 'event', 'Party');
    await api.addPeopleFrom(g, FIXTURE.circles.dadSide.id, 'all');
    const names = async () => (await api.myCircles(FIXTURE.space.id)).find((c) => c.circle_id === g)?.member_names;
    expect(await names()).toEqual(['Grandma Jo', 'Grandpa Earl']);
    await api.placePerson(FIXTURE.circles.dadSide.id, FIXTURE.users.ruth.id, 'all');
    expect(await names()).toEqual(['Grandma Jo', 'Grandpa Earl']);
  });

  it('GRP-15 family_people: parents get everyone with ids; a relative sees herself and the parents only', async () => {
    const be = chase();
    const all = await be.clientFor(FIXTURE.users.chase.id).familyPeople(FIXTURE.space.id);
    expect(all).toEqual(expect.arrayContaining([{ user_id: FIXTURE.users.ruth.id, name: 'Nana Ruth', role: 'viewer' }]));
    expect(all).toHaveLength(5);
    const jo = (await be.clientFor(FIXTURE.users.jo.id).familyPeople(FIXTURE.space.id)).map((p) => p.name).sort();
    expect(jo).toEqual(['Alex', 'Chase', 'Grandma Jo']);
  });

  it('FLAG-5 my_features: all three switches must be on; relatives never get video_posting', async () => {
    const be = chase();
    const chaseApi = be.clientFor(FIXTURE.users.chase.id);
    expect(await chaseApi.myFeatures(FIXTURE.space.id)).toEqual([]);
    be.state.featureFlags = { video_posting: true };
    expect(await chaseApi.myFeatures(FIXTURE.space.id)).toEqual([]);
    be.state.spaceFeatures = { [`${FIXTURE.space.id}:video_posting`]: true };
    expect(await chaseApi.myFeatures(FIXTURE.space.id)).toEqual(['video_posting']);
    expect(await be.clientFor(FIXTURE.users.jo.id).myFeatures(FIXTURE.space.id)).toEqual([]);
  });
});
