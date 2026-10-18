// SPEC-GROUPS v2, app-now: New group (GRP-15), copy people from a group (GRP-16), the Always-shared
// confirmation (GRP-17) and inviting to several groups (GRP-18). Written first: red until the screen catches up.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { expectGrandparentSafe, renderApp, screenWords } from '../../test/renderApp';
import { GroupsScreen } from '../GroupsScreen';

const DAD = "Grandparents – Dad's side";
const MOM = "Grandparents – Mom's side";

async function groupsAs(user: 'chase' | 'jo' | 'ruth' = 'chase', be = FakeBackend.withFixture()) {
  const api = be.clientFor(null, { trackAppSession: true });
  const spies = {
    createLevel: jest.spyOn(api, 'createLevel'),
    setCommentMode: jest.spyOn(api, 'setCommentMode'),
    placePerson: jest.spyOn(api, 'placePerson'),
    createInvite: jest.spyOn(api, 'createInvite'),
  };
  await renderApp(<GroupsScreen />, { be, user, deps: { api } });
  return { be, api, ...spies };
}

const findGroup = (be: FakeBackend, name: string) => Object.values(be.state.circles).find((c) => c.name === name);
const membersOf = (be: FakeBackend, id: string) => be.circleMemberIds(id).map((u) => be.state.users[u]!.name).sort();

describe('GRP-15 New group (parents only)', () => {
  async function openNew() {
    const r = await groupsAs();
    fireEvent.press(await screen.findByRole('button', { name: 'New group' }));
    await screen.findByRole('checkbox', { name: 'Grandma Jo' });
    return r;
  }

  it('GRP-15 the form has a name, people to tick, three comment settings in plain words and share history', async () => {
    await openNew();
    expect(screen.getByLabelText('Name of the group')).toBeTruthy();
    // relatives only: parents already see and read everything
    expect(screen.getByRole('checkbox', { name: 'Nana Ruth' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Alex' })).toBeNull();
    expect(screen.getByRole('header', { name: 'Who reads their comments?' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Private' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('radio', { name: "Shared on this group's posts" })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Always shared' })).toBeTruthy();
    expect(screen.getByText('Only the parents and whoever posted the photo read them.')).toBeTruthy();
    expect(screen.getByText("People in this group read each other's comments on photos sent to this group.")).toBeTruthy();
    expect(screen.getByText("People in this group read each other's comments on every photo they can both see.")).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Share all past photos' }).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByRole('radio', { name: 'Only new photos' }).props.accessibilityState).toMatchObject({ checked: false });
    expectGrandparentSafe();
    expect(screenWords()).not.toMatch(/circle/i);
  });

  it('GRP-15 name, tick people, comment setting, share history: the group exists with exactly those people', async () => {
    const { be, setCommentMode } = await openNew();
    fireEvent.changeText(screen.getByLabelText('Name of the group'), "Chase's birthday");
    fireEvent.press(screen.getByRole('checkbox', { name: 'Grandma Jo' }));
    fireEvent.press(screen.getByRole('checkbox', { name: 'Nana Ruth' }));
    fireEvent.press(screen.getByRole('radio', { name: "Shared on this group's posts" }));
    fireEvent.press(screen.getByRole('radio', { name: 'Only new photos' }));
    fireEvent.press(screen.getByRole('button', { name: 'Make the group' }));
    expect(await screen.findByText("Chase's birthday")).toBeTruthy();
    const g = findGroup(be, "Chase's birthday")!;
    expect(g.kind).toBe('group');
    expect(g.comment_mode).toBe('on_group_posts');
    expect(setCommentMode).toHaveBeenCalledWith(g.id, 'on_group_posts');
    expect(membersOf(be, g.id)).toEqual(['Grandma Jo', 'Nana Ruth']);
    expectGrandparentSafe();
  });

  it('GRP-15 "Make the group" waits for a name and a share-history choice; nothing is made before', async () => {
    const { createLevel } = await openNew();
    const make = screen.getByRole('button', { name: 'Make the group' });
    expect(make.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(make);
    expect(await screen.findByText('Type a name for the group first.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Name of the group'), 'Cousins');
    fireEvent.press(screen.getByRole('button', { name: 'Make the group' }));
    expect(await screen.findByText('Pick one above first.')).toBeTruthy();
    expect(createLevel).not.toHaveBeenCalled();
  });

  it('GRP-15 an occasion (event) starts Shared on this group\'s posts', async () => {
    const { be } = await openNew();
    fireEvent.changeText(screen.getByLabelText('Name of the group'), 'Beach week');
    fireEvent.press(screen.getByRole('checkbox', { name: 'This is for an occasion (event)' }));
    expect(screen.getByRole('radio', { name: "Shared on this group's posts" }).props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByRole('radio', { name: 'Share all past photos' }));
    fireEvent.press(screen.getByRole('button', { name: 'Make the group' }));
    expect(await screen.findByText('Beach week')).toBeTruthy();
    const g = findGroup(be, 'Beach week')!;
    expect(g.kind).toBe('event');
    expect(g.comment_mode).toBe('on_group_posts');
  });

  it('GRP-15 relatives never see group management or comment settings, even one allowed to post', async () => {
    const be = FakeBackend.withFixture();
    const real = be.mySpaces.bind(be);
    jest.spyOn(be, 'mySpaces').mockImplementation((u) => real(u).map((s) => ({ ...s, can_post: true })));
    await groupsAs('ruth', be);
    expect(await screen.findByText("You can't do that here.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New group' })).toBeNull();
    expect(screen.queryByText(/Always shared|Private/)).toBeNull();
  });
});

describe('GRP-16 Add everyone from a group (copied once)', () => {
  it('GRP-16 ticks that group\'s people and says later additions won\'t follow', async () => {
    const { be } = await groupsAs();
    fireEvent.press(await screen.findByRole('button', { name: 'New group' }));
    fireEvent.press(await screen.findByRole('button', { name: `Add everyone from ${DAD}` }));
    expect(screen.getByRole('checkbox', { name: 'Grandma Jo' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('checkbox', { name: 'Grandpa Earl' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('checkbox', { name: 'Nana Ruth' }).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText(`People added to ${DAD} later won't be added here.`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add everyone from Everyone' })).toBeNull();
    expectGrandparentSafe();
    fireEvent.changeText(screen.getByLabelText('Name of the group'), "Chase's birthday");
    fireEvent.press(screen.getByRole('radio', { name: 'Share all past photos' }));
    fireEvent.press(screen.getByRole('button', { name: 'Make the group' }));
    expect(await screen.findByText("Chase's birthday")).toBeTruthy();
    expect(membersOf(be, findGroup(be, "Chase's birthday")!.id)).toEqual(['Grandma Jo', 'Grandpa Earl']);
  });
});

describe('GRP-17 switching a group to Always shared asks first', () => {
  it('GRP-17 names who will read each other\'s comments; nothing changes until they confirm', async () => {
    const { be, setCommentMode } = await groupsAs();
    const always = await screen.findByRole('radio', { name: `Always shared for ${DAD}` });
    expect(screen.getByRole('radio', { name: `Private for ${DAD}` }).props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(always);
    expect(await screen.findByText("Grandma Jo and Grandpa Earl will read each other's comments on every photo they can see.")).toBeTruthy();
    expect(setCommentMode).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: `Private for ${DAD}` }).props.accessibilityState).toMatchObject({ checked: true });
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: 'Turn on Always shared' }));
    await waitFor(() => expect(setCommentMode).toHaveBeenCalledWith(FIXTURE.circles.dadSide.id, 'always'));
    await waitFor(() => expect(screen.getByRole('radio', { name: `Always shared for ${DAD}` }).props.accessibilityState).toMatchObject({ checked: true }));
    expect(be.state.circles[FIXTURE.circles.dadSide.id]!.comment_mode).toBe('always');
  });

  it('GRP-17 Cancel leaves it as it was', async () => {
    const { setCommentMode } = await groupsAs();
    fireEvent.press(await screen.findByRole('radio', { name: `Always shared for ${DAD}` }));
    fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/will read each other's comments on every photo/)).toBeNull();
    expect(setCommentMode).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: `Private for ${DAD}` }).props.accessibilityState).toMatchObject({ checked: true });
  });

  it('GRP-17 the other settings change at once; Everyone has no setting to change', async () => {
    const { setCommentMode } = await groupsAs();
    fireEvent.press(await screen.findByRole('radio', { name: `Shared on this group's posts for ${MOM}` }));
    await waitFor(() => expect(setCommentMode).toHaveBeenCalledWith(FIXTURE.circles.momSide.id, 'on_group_posts'));
    expect(screen.queryByRole('radio', { name: 'Private for Everyone' })).toBeNull();
    expect(screenWords()).not.toMatch(/circle/i);
  });
});

describe('GRP-18 an invite can name several groups', () => {
  it('GRP-18 Everyone ticked first, other groups can be ticked too, and share history is required', async () => {
    const { createInvite } = await groupsAs();
    fireEvent.press(await screen.findByRole('button', { name: `Invite someone to ${DAD}` }));
    const boxes = screen.getAllByRole('checkbox').map((b) => b.props.accessibilityLabel as string);
    expect(boxes[0]).toBe('Also see photos sent to Everyone');
    const mom = screen.getByRole('checkbox', { name: `Also add them to ${MOM}` });
    expect(mom.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(mom);
    expectGrandparentSafe();
    fireEvent.press(screen.getByRole('button', { name: 'Make the invite' }));
    expect(await screen.findByText('Pick one above first.')).toBeTruthy();
    expect(createInvite).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('radio', { name: 'Only new photos' }));
    fireEvent.press(screen.getByRole('button', { name: 'Make the invite' }));
    expect(await screen.findByText('Works for 30 days.')).toBeTruthy();
    expect(createInvite).toHaveBeenCalledWith(expect.objectContaining({
      history: 'new', circleIds: [FIXTURE.circles.dadSide.id, FIXTURE.circles.momSide.id, FIXTURE.circles.everyone.id],
    }));
  });
});
