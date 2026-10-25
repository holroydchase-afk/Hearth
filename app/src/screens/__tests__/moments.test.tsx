// MOMENT-1..8 (Chase, UAT 9, Oct 19 and Oct 24): a moment is one upload shown as one compact card,
// like a standard photo feed: who and when, a photo collage, one row of actions, the newest comment and a
// one-row reply box (DEC-30 keeps the box on the card); older comments, who can see it and Delete are one
// worded tap away. Prototype: prototype/moments.html. Written first.
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { MediaImage } from '../MediaImage';
import { PhotosScreen } from '../PhotosScreen';
import { collageShape } from '../PhotoCollage';

const { dadSide } = FIXTURE.circles;
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

async function one(opts: { photos?: number; caption?: string; sizes?: Array<[number, number]> } = {}) {
  const be = FakeBackend.withFixture();
  const { id } = await seedPost(be, { caption: opts.caption ?? 'At the lake', circles: [dadSide.id], ...opts });
  return { be, id };
}

describe('MOMENT: one compact card per upload', () => {
  it('MOMENT-1 the head says who and when, and the sender sees who it went to', async () => {
    const { be, id } = await one();
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    const card = await screen.findByTestId(`post-${id}`);
    expect(within(card).getByText('Chase')).toBeTruthy();
    expect(within(card).getByText(/to Grandparents – Dad's side/)).toBeTruthy();
    expect(within(card).getByText('At the lake')).toBeTruthy();
  });

  it('MOMENT-2 collage shapes: 1 photo alone, 2 side by side, 3 = one big and two, 4+ = one big and three with "+N"', () => {
    expect(collageShape(1)).toEqual({ big: 1, small: 0, more: 0 });
    expect(collageShape(2)).toEqual({ big: 0, small: 2, more: 0 });
    expect(collageShape(3)).toEqual({ big: 1, small: 2, more: 0 });
    expect(collageShape(4)).toEqual({ big: 1, small: 3, more: 0 });
    expect(collageShape(9)).toEqual({ big: 1, small: 3, more: 5 });
  });

  it('MOMENT-2 a 9-photo moment shows 4 photos at once, "+5" on the last, and each opens the viewer there', async () => {
    const { be, id } = await one({ photos: 9 });
    const { nav } = await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const card = await screen.findByTestId(`post-${id}`);
    expect(within(card).UNSAFE_queryAllByType(MediaImage)).toHaveLength(4);
    expect(within(card).getByText('+5')).toBeTruthy();
    fireEvent.press(within(card).getByRole('button', { name: 'Open photo 2 of 9 full screen' }));
    expect(nav.openViewer).toHaveBeenCalledWith(id, 1);
    fireEvent.press(within(card).getByRole('button', { name: 'Open photo 4 of 9 full screen, and 5 more' }));
    expect(nav.openViewer).toHaveBeenCalledWith(id, 3);
    // no in-card swiping and no "1 of 9" buttons: the viewer has Back and Next
    expect(within(card).queryByRole('button', { name: 'Next photo' })).toBeNull();
    expect(within(card).queryByText('1 of 9')).toBeNull();
  });

  it('MOMENT-2 every photo fills its tile (no grey bars); one photo keeps its shape between 4:5 and 1.91:1', async () => {
    const { be, id } = await one({ photos: 1, sizes: [[1536, 4000]] });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const card = await screen.findByTestId(`post-${id}`);
    for (const img of within(card).UNSAFE_queryAllByType(MediaImage)) expect(img.props.fit ?? 'cover').toBe('cover');
    const tile = within(card).getByRole('button', { name: 'Open photo 1 of 1 full screen' });
    expect(flat(tile.props.style).aspectRatio).toBe(0.8);
  });

  it('MOMENT-3 Love it and Comment sit side by side in one row, each with its word', async () => {
    const { be, id } = await one();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const card = await screen.findByTestId(`post-${id}`);
    const row = within(card).getByTestId(`actions-${id}`);
    expect(flat(row.props.style).flexDirection).toBe('row');
    expect(within(row).getByRole('button', { name: 'Love it' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Write a comment' })).toBeTruthy();
    expect(within(row).getByText('Love')).toBeTruthy();
    expect(within(row).getByText('Comment')).toBeTruthy();
    fireEvent.press(within(row).getByRole('button', { name: 'Love it' }));
    await waitFor(() => expect(be.state.hearts).toHaveLength(1));
    expect(await within(card).findByText('1 person loves this')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Love it' }).props.accessibilityState.selected).toBe(true);
  });

  it('MOMENT-4 the reply box is one row with Send beside it, says who will read it, and no Delete sits on the card', async () => {
    const { be, id } = await one();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const card = await screen.findByTestId(`post-${id}`);
    const row = within(card).getByTestId(`reply-${id}`);
    expect(flat(row.props.style).flexDirection).toBe('row');
    expect(within(row).getByLabelText('Write something back to Chase')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Send' })).toBeTruthy();
    expect(await within(card).findByText('Alex and Chase will read this.')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: /Delete/ })).toBeNull();
    fireEvent.changeText(within(row).getByLabelText('Write something back to Chase'), 'So cute!');
    fireEvent.press(within(row).getByRole('button', { name: 'Send' }));
    expect(await within(card).findByText('Sent. Alex and Chase will read it.')).toBeTruthy();
    expect(await within(card).findByText(/So cute!/)).toBeTruthy();
  });

  it('MOMENT-4 Comment puts the cursor in the reply box (no new screen)', async () => {
    const { be, id } = await one();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const card = await screen.findByTestId(`post-${id}`);
    const focus = jest.spyOn(within(card).UNSAFE_getByType(TextInput).instance as { focus: () => void }, 'focus');
    fireEvent.press(within(card).getByRole('button', { name: 'Write a comment' }));
    expect(focus).toHaveBeenCalled();
    expect(screen.queryByTestId(`comments-${id}`)).toBeNull();
  });

  it('MOMENT-5 the card shows only the newest comment and "See all 3 comments"', async () => {
    const { be, id } = await one();
    for (const [who, body] of [['jo', 'First'], ['alex', 'Second'], ['chase', 'Third and newest']] as const) {
      await be.clientFor(FIXTURE.users[who].id).addComment({ post: id, body, clientId: `${who}-c` });
    }
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    const card = await screen.findByTestId(`post-${id}`);
    expect(await within(card).findByText(/Third and newest/)).toBeTruthy();
    expect(within(card).queryByText(/First/)).toBeNull();
    fireEvent.press(within(card).getByRole('button', { name: 'See all 3 comments' }));
    const sheet = await screen.findByTestId(`comments-${id}`);
    expect(within(sheet).getByRole('header', { name: 'Comments' })).toBeTruthy();
    expect(within(sheet).getByText(/First/)).toBeTruthy();
    expect(within(sheet).getByText(/Second/)).toBeTruthy();
    expectGrandparentSafe();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close comments' }));
    await waitFor(() => expect(screen.queryByTestId(`comments-${id}`)).toBeNull());
  });

  it('MOMENT-6 More says who can see it; the sender can Delete there, after a confirm', async () => {
    const { be, id } = await one({ photos: 3 });
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    fireEvent.press(within(await screen.findByTestId(`post-${id}`)).getByRole('button', { name: 'More for these photos' }));
    const menu = await screen.findByTestId(`more-${id}`);
    expect(within(menu).getByText("Shared with Grandparents – Dad's side · 3 people")).toBeTruthy();
    expectGrandparentSafe();
    fireEvent.press(within(menu).getByRole('button', { name: 'Delete these 3 photos' }));
    expect(await screen.findByText('Delete these 3 photos for everyone?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Yes, delete them' }));
    await waitFor(() => expect(be.state.posts[id]!.deleted).toBe(true));
  });

  it('MOMENT-6 a viewer\'s More has no Delete, and Close shuts it', async () => {
    const { be, id } = await one();
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    fireEvent.press(within(await screen.findByTestId(`post-${id}`)).getByRole('button', { name: 'More for this photo' }));
    const menu = await screen.findByTestId(`more-${id}`);
    expect(within(menu).getByText('Shared with you')).toBeTruthy();
    expect(within(menu).queryByRole('button', { name: /Delete/ })).toBeNull();
    fireEvent.press(within(menu).getByRole('button', { name: 'Close this menu' }));
    await waitFor(() => expect(screen.queryByTestId(`more-${id}`)).toBeNull());
  });

  it('MOMENT-7 each upload is its own moment, even three within an hour', async () => {
    const be = FakeBackend.withFixture();
    const ids = [];
    for (const caption of ['Lake', 'Dock', 'Boat']) ids.push((await seedPost(be, { caption, photos: 2 })).id);
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    for (const id of ids) expect(await screen.findByTestId(`post-${id}`)).toBeTruthy();
    expect(screen.queryByTestId(/^session-/)).toBeNull();
  });

  it('MOMENT-8 the card is grandparent-safe (48 pt targets, 17 pt text, every button labeled)', async () => {
    const { be } = await one({ photos: 5 });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    await screen.findByText('At the lake');
    expectGrandparentSafe();
  });
});
