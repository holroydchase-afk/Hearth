// CAP-6..8 (docs/product/SPEC-CAPTIONS.md, DEC-39 CAP-D2): the sender changes the title and caption from More;
// the card says "Edited" after the date; nobody else gets the button; a refusal keeps the old words.
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { ApiError } from '../../api/HearthApi';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';

async function openChange() {
  fireEvent.press(await screen.findByRole('button', { name: 'More for this photo' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Change the words' }));
  return screen.findByTestId(/^words-/);
}

describe('CAP change the words', () => {
  it('CAP-6 the sender opens More, Change the words: both boxes come filled in; Save updates the card and says Edited', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    const { id } = await seedPost(be, { title: 'Party', caption: 'Cake' });
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    const sheet = await openChange();
    const title = within(sheet).getByLabelText('Title (optional)');
    const caption = within(sheet).getByLabelText("What's happening?");
    expect(title.props.value).toBe('Party');
    expect(title.props.maxLength).toBe(80);
    expect(caption.props.value).toBe('Cake');
    expectGrandparentSafe();
    fireEvent.changeText(title, 'Mia turns 5');
    fireEvent.changeText(caption, 'Cake, candles, a nap');
    fireEvent.press(within(sheet).getByRole('button', { name: 'Save the new words' }));
    expect(await screen.findByRole('header', { name: 'Mia turns 5' })).toBeTruthy();
    expect(screen.getByText('Cake, candles, a nap')).toBeTruthy();
    expect(screen.getByTestId(`when-${id}`).props.children).toMatch(/· Edited/);
    expect(screen.queryByTestId(/^words-/)).toBeNull();
    const jo = await be.clientFor(FIXTURE.users.jo.id).getFeed({ space: FIXTURE.space.id });
    expect(jo[0]?.title).toBe('Mia turns 5');
    expect(jo[0]?.words_edited_at).toBeTruthy();
  });

  it('CAP-6 Cancel closes the sheet and keeps the words', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    const { id } = await seedPost(be, { title: 'Party', caption: 'Cake' });
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    const sheet = await openChange();
    fireEvent.changeText(within(sheet).getByLabelText('Title (optional)'), 'Oops');
    fireEvent.press(within(sheet).getByRole('button', { name: 'Cancel, keep the words' }));
    await waitFor(() => expect(screen.queryByTestId(/^words-/)).toBeNull());
    expect(screen.getByRole('header', { name: 'Party' })).toBeTruthy();
    expect(screen.getByTestId(`when-${id}`).props.children).not.toMatch(/Edited/);
  });

  it('CAP-7 someone who did not send it never sees Change the words', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    await seedPost(be, { title: 'Party' });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'More for this photo' }));
    await screen.findByText('Who can see this');
    expect(screen.queryByRole('button', { name: 'Change the words' })).toBeNull();
  });

  it('CAP-7 if the server refuses, the sheet says so in plain words and the card keeps the old words', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    await seedPost(be, { title: 'Party', caption: 'Cake' });
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    jest.spyOn(be, 'editPostWords').mockImplementation(() => { throw new ApiError('42501', 'no'); });
    const sheet = await openChange();
    fireEvent.changeText(within(sheet).getByLabelText('Title (optional)'), 'Mia turns 5');
    fireEvent.press(within(sheet).getByRole('button', { name: 'Save the new words' }));
    expect(await within(sheet).findByText("These words can't be changed now. Your old words are kept.")).toBeTruthy();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Cancel, keep the words' }));
    await waitFor(() => expect(screen.queryByTestId(/^words-/)).toBeNull());
    expect(screen.getByRole('header', { name: 'Party' })).toBeTruthy();
  });
});
