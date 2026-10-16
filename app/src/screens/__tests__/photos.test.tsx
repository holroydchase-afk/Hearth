import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp, screenWords } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';
import { useApp } from '../../state/AppContext';

const { dadSide, momSide } = FIXTURE.circles;

async function twoPosts() {
  const be = FakeBackend.withFixture();
  await seedPost(be, { caption: 'Shared with Dad side', circles: [dadSide.id] });
  await seedPost(be, { caption: 'Shared with Mom side', circles: [momSide.id] });
  return be;
}

describe('Photos screen', () => {
  it('BETA-JOIN-1 / BETA-AUD-3: a viewer sees only posts shared with her', async () => {
    const be = await twoPosts();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    expect(await screen.findByText('Shared with Dad side')).toBeTruthy();
    expect(screen.queryByText('Shared with Mom side')).toBeNull();
    expect(screen.getByText('Shared with you')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Photos of Mia and Leo' })).toBeTruthy();
    expect(screen.queryByText(/Seen by/)).toBeNull();
  });

  it('and the other grandma sees only hers', async () => {
    const be = await twoPosts();
    await renderApp(<PhotosScreen />, { be, user: 'ruth' });
    expect(await screen.findByText('Shared with Mom side')).toBeTruthy();
    expect(screen.queryByText('Shared with Dad side')).toBeNull();
  });

  it('BETA-AUD-1 / NOTIFY-6: the author sees who it went to in words, and "Seen by X of Y"', async () => {
    const be = FakeBackend.withFixture();
    const { id } = await seedPost(be, { caption: 'Pumpkins', circles: [dadSide.id] });
    await be.clientFor(FIXTURE.users.jo.id).markSeen(id);
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    expect(await screen.findByText("Shared with Grandparents – Dad's side · 3 people")).toBeTruthy();
    expect(screen.getByText('Seen by 1 of 2')).toBeTruthy();
  });

  it('shows "Loading the photos…" with words while it loads', async () => {
    const be = await twoPosts();
    const api = be.clientFor(null, { trackAppSession: true });
    jest.spyOn(api, 'getFeed').mockImplementation(() => new Promise(() => {}));
    await renderApp(<PhotosScreen />, { be, user: 'jo', deps: { api } });
    expect(screen.getByText('Loading the photos…')).toBeTruthy();
  });

  it('BETA-REPLY-1: "Love it" toggles in one tap', async () => {
    const be = await twoPosts();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const heart = await screen.findByRole('button', { name: 'Love it' });
    fireEvent.press(heart);
    expect(await screen.findByText('♥ You love this')).toBeTruthy();
    await waitFor(() => expect(be.state.hearts).toHaveLength(1));
    expect(screen.getByText('1 person loves this')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Love it' }));
    expect(await screen.findByText('♡ Love it')).toBeTruthy();
    await waitFor(() => expect(be.state.hearts).toHaveLength(0));
  });

  it('BETA-REPLY-2: writing back shows the comment and says who will see it', async () => {
    const be = await twoPosts();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const box = await screen.findByLabelText('Write something back to Chase');
    fireEvent.changeText(box, 'So cute!');
    fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/So cute!/)).toBeTruthy();
    expect(await screen.findByText("Sent. Only the kids' parents can read it.")).toBeTruthy();
    await waitFor(() => expect(Object.values(be.state.comments)).toHaveLength(1));
  });

  it('BETA-REPLY-6: the words name who can read a comment, never only Chase and never a vague "everyone"', async () => {
    const be = await twoPosts();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    await screen.findAllByLabelText('Write something back to Chase');
    expect(screen.getAllByText("Only the kids' parents can read this.").length).toBeGreaterThan(0); // AUD-8 default
    expect(screen.queryByText(/everyone/i)).toBeNull();
    const box = screen.getAllByLabelText('Write something back to Chase')[0]!;
    fireEvent.changeText(box, 'Love you all');
    fireEvent.press(screen.getAllByRole('button', { name: 'Send' })[0]!);
    expect(await screen.findByText("Sent. Only the kids' parents can read it.")).toBeTruthy();
    expect(screen.queryByText(/Chase will see it/)).toBeNull();
  });

  it('BETA-AUD-9: in a group whose members see each other\'s replies, the box says so', async () => {
    const be = await twoPosts();
    be.state.circles[FIXTURE.circles.dadSide.id]!.replies_shared = true;
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    await screen.findAllByLabelText('Write something back to Chase');
    expect(screen.getAllByText("The kids' parents and your part of the family can read this.").length).toBeGreaterThan(0);
  });

  it('BETA-AUD-10: when the family opens replies to everyone, the box names who', async () => {
    const be = await twoPosts();
    be.state.spaces[FIXTURE.space.id]!.reply_audience = 'everyone';
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    await screen.findAllByLabelText('Write something back to Chase');
    expect(screen.getAllByText('Chase and the family Chase shared this photo with can read this.').length).toBeGreaterThan(0);
  });

  it('B6: a half-typed comment survives incoming hearts', async () => {
    const be = await twoPosts();
    const { getByLabelText } = await renderApp(<Probe />, { be, user: 'jo' });
    const box = await screen.findByLabelText('Write something back to Chase');
    fireEvent.changeText(box, 'She looks just like');
    const postId = Object.values(be.state.posts).find((p) => p.caption === 'Shared with Dad side')!.id;
    await be.clientFor(FIXTURE.users.chase.id).toggleHeart(postId);
    await be.clientFor(FIXTURE.users.earl.id).toggleHeart(postId); // AUD-8: Jo can't see a relative's heart
    await act(async () => { await probe.app!.feed!.refresh(); });
    expect(await screen.findByText('1 person loves this')).toBeTruthy();
    expect(getByLabelText('Write something back to Chase').props.value).toBe('She looks just like');
  });

  it('BETA-AUD-5: deleting asks first; "No" keeps it, "Yes" removes it everywhere', async () => {
    const be = await twoPosts();
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    const card = await screen.findByTestId(`post-${Object.values(be.state.posts).find((p) => p.caption === 'Shared with Dad side')!.id}`);
    fireEvent.press(within(card).getByRole('button', { name: 'Delete this photo' }));
    expect(screen.getByText('Delete this photo for everyone?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'No, keep it' }));
    expect(screen.queryByText('Delete this photo for everyone?')).toBeNull();
    expect(screen.getByText('Shared with Dad side')).toBeTruthy();
    fireEvent.press(within(card).getByRole('button', { name: 'Delete this photo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Yes, delete it' }));
    await waitFor(() => expect(screen.queryByText('Shared with Dad side')).toBeNull());
    expect(await be.clientFor(FIXTURE.users.jo.id).getFeed({ space: FIXTURE.space.id })).toHaveLength(0);
  });

  it('viewers have no Delete button', async () => {
    const be = await twoPosts();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    await screen.findByText('Shared with Dad side');
    expect(screen.queryByRole('button', { name: 'Delete this photo' })).toBeNull();
  });

  it('BETA-SEE-3: tapping a photo opens it full screen', async () => {
    const be = await twoPosts();
    const { nav } = await renderApp(<PhotosScreen />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Open photo 1 of 1 full screen' }));
    expect(nav.openViewer).toHaveBeenCalledWith(expect.any(String), 0);
  });

  it('marks what Grandma Jo looked at as seen (for "Seen by")', async () => {
    const be = await twoPosts();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    await screen.findByText('Shared with Dad side');
    await waitFor(() => expect(be.state.seen).toHaveLength(1));
  });

  it('empty family: says what will happen, in plain words', async () => {
    await renderApp(<PhotosScreen />, { user: 'jo' });
    expect(await screen.findByText("No photos yet. When Chase shares photos, they'll show up here.")).toBeTruthy();
  });

  it.each(['jo', 'chase'] as const)('accessibility for %s: labels, 48 pt targets, 17 pt text, no passwords', async (user) => {
    const be = await twoPosts();
    await renderApp(<PhotosScreen />, { be, user });
    await screen.findByText('Shared with Dad side');
    expectGrandparentSafe();
  });

  it("UXG-07: no words June doesn't use on her screen", async () => {
    const be = await twoPosts();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    await screen.findByText('Shared with Dad side');
    expect(screenWords()).not.toMatch(/\b(feed|circles?|audience|sync|upload|notifications?|expired|account|settings|digest|posts?|react|servers?|encrypted)\b/i);
  });
});

// Lets a test reach the app's stores (to simulate a background refresh).
const probe: { app: ReturnType<typeof useApp> | null } = { app: null };
function Probe() {
  probe.app = useApp();
  return <PhotosScreen />;
}
