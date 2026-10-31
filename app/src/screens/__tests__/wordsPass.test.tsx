// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// WORDS-1..4 (grandparent-ux words pass, Oct 29; docs/product/decisions/2026-10-29-words-pass.md): words that must be
// true for every sender, a refusal that says nothing was lost, a privacy line that reads as a whole sentence, and a
// group name that never wraps around its count.
import { fireEvent, screen, within } from '@testing-library/react-native';
import React from 'react';
import { FakeBackend } from '../../api/fake/FakeBackend';
import { ApiError } from '../../api/HearthApi';
import { seedPost } from '../../test/seed';
import { renderApp } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';
import { ShareScreen } from '../ShareScreen';

const DAD = "Grandparents – Dad's side";

describe('WORDS grandparent-ux words pass', () => {
  it('WORDS-1 the caption box never promises "Grandma will see this": it names the groups you pick', async () => {
    await renderApp(<ShareScreen />, { user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: 'Pick photos from your phone' }));
    await screen.findByText('1 photo picked');
    const caption = screen.getByLabelText("What's happening?");
    expect(caption.props.placeholder).toBe("Say what's happening. The groups you pick will see it.");
  });

  it('WORDS-2 if changing the words is refused, the sheet says the old words are kept', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    await seedPost(be, { title: 'Party' });
    await renderApp(<PhotosScreen />, { be, user: 'chase' });
    jest.spyOn(be, 'editPostWords').mockImplementation(() => { throw new ApiError('42501', 'no'); });
    fireEvent.press(await screen.findByRole('button', { name: 'More for this photo' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Change the words' }));
    const sheet = await screen.findByTestId(/^words-/);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Save the new words' }));
    expect(await within(sheet).findByText("These words can't be changed now. Your old words are kept.")).toBeTruthy();
  });

  it('WORDS-3 the Messages privacy line reads as whole sentences: "Not even Hearth can read it"', async () => {
    await renderApp(<PhotosScreen />, { be: FakeBackend.withFixture({ joIsMember: true }), user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Messages' }));
    expect(await screen.findByText(
      'Only the people in this chat can read it. Parents are in every chat. Not even Hearth can read it: messages are locked on your phone before they are sent.',
    )).toBeTruthy();
  });

  it('WORDS-4 a group on Share shows its name alone, with the count starting the line of names', async () => {
    await renderApp(<ShareScreen />, { user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: 'Pick photos from your phone' }));
    await screen.findByText('1 photo picked');
    const choice = screen.getByRole('checkbox', { name: `${DAD}, 3 people` });
    expect(within(choice).getByText(DAD)).toBeTruthy();
    expect(within(choice).getByText(/^3 people: /)).toBeTruthy();
    expect(within(choice).queryByText(`${DAD} · 3 people`)).toBeNull();
  });
});
