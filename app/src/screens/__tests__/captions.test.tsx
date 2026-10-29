// CAP-1, CAP-3..5 (docs/product/SPEC-CAPTIONS.md, DEC-39): an optional title for the whole set, shown as the
// card's heading above the caption; a long caption folds to 4 lines behind a worded Read more.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FIXTURE, FakeBackend } from '../../api/fake/FakeBackend';
import { seedPost } from '../../test/seed';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { PhotosScreen } from '../PhotosScreen';
import { ShareScreen } from '../ShareScreen';

const DAD = "Grandparents – Dad's side";

describe('CAP post titles', () => {
  it('CAP-1 Share has an optional Title box (80 characters) above the caption, and the title goes out with the post', async () => {
    const be = FakeBackend.withFixture();
    const { nav } = await renderApp(<ShareScreen />, { be, user: 'chase' });
    fireEvent.press(await screen.findByRole('button', { name: 'Pick photos from your phone' }));
    await screen.findByText('1 photo picked');
    const title = screen.getByLabelText('Title (optional)');
    expect(title.props.maxLength).toBe(80);
    fireEvent.changeText(title, "Lily's 5th birthday");
    fireEvent.press(screen.getByRole('checkbox', { name: `${DAD}, 3 people` }));
    fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(nav.goPhotos).toHaveBeenCalled());
    await waitFor(async () => {
      const feed = await be.clientFor(FIXTURE.users.jo.id).getFeed({ space: FIXTURE.space.id });
      expect(feed[0]?.title).toBe("Lily's 5th birthday");
    });
  });

  it('CAP-3 the card shows the title as a heading, then the caption', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    await seedPost(be, { title: "Lily's 5th birthday", caption: 'Cake, candles, a nap' });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    expect(await screen.findByRole('header', { name: "Lily's 5th birthday" })).toBeTruthy();
    expect(screen.getByText('Cake, candles, a nap')).toBeTruthy();
    expectGrandparentSafe();
  });

  it('CAP-5 no title: no heading and no empty space', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    await seedPost(be, { caption: 'Mia at the park' });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    await screen.findByText('Mia at the park');
    expect(screen.queryByTestId(/^post-title-/)).toBeNull();
  });

  it('CAP-4 a long caption folds to 4 lines with a worded Read more, and Show less folds it again', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    const long = Array.from({ length: 8 }, (_, i) => `Line ${i + 1} of a long story about the beach.`).join('\n');
    await seedPost(be, { caption: long });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    const text = await screen.findByText(long);
    expect(text.props.numberOfLines).toBe(4);
    fireEvent.press(screen.getByRole('button', { name: 'Read more of this caption' }));
    expect(screen.getByText(long).props.numberOfLines ?? 0).toBe(0);
    fireEvent.press(screen.getByRole('button', { name: 'Show less of this caption' }));
    expect(screen.getByText(long).props.numberOfLines).toBe(4);
  });

  it('CAP-4 a short caption has no Read more', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    await seedPost(be, { caption: 'Mia at the park' });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    await screen.findByText('Mia at the park');
    expect(screen.queryByRole('button', { name: /Read more/ })).toBeNull();
  });

  it('CAP-11 By date shows the title too', async () => {
    const be = FakeBackend.withFixture({ joIsMember: true });
    await seedPost(be, { title: 'Beach weekend', caption: 'Found these from August', takenAt: '2026-08-10T12:00:00.000Z' });
    await renderApp(<PhotosScreen />, { be, user: 'jo' });
    fireEvent.press(await screen.findByRole('button', { name: 'Show photos by the date they were taken' }));
    expect(await screen.findByRole('header', { name: 'Beach weekend' })).toBeTruthy();
    expect(screen.getByRole('header', { name: /by date|By date/ })).toBeTruthy();
  });
});
