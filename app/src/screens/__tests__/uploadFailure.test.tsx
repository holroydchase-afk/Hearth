// MEDIA-3 + BETA-SHARE-4 (UAT item 6): a photo that couldn't be made private shows "Didn't send"
// with a short reason line in plain words (not "Something went wrong"), Try again and Remove,
// and one code-only error report reaches client_errors.
import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { ApiError, type ApiErrorCode } from '../../api/HearthApi';
import { FakeBackend } from '../../api/fake/FakeBackend';
import { renderApp } from '../../test/renderApp';
import { ShareScreen } from '../ShareScreen';

const DAD = "Grandparents – Dad's side";
const REASON = "This photo couldn't be made private, so it wasn't sent. Try a different photo.";

describe('upload that fails in the prepare step', () => {
  it.each(['EXIF', 'META_LOCATION'])('MEDIA-3 BETA-SHARE-4 prepare fails %s: "Didn\'t send" with a short reason line and one code-only report', async (code) => {
    const be = FakeBackend.withFixture();
    await renderApp(<ShareScreen />, {
      be, user: 'chase',
      deps: { prepare: jest.fn(async () => { throw new ApiError(code as ApiErrorCode, 'file:///pick/1.jpg "First snow!"'); }) },
    });
    fireEvent.press(await screen.findByRole('button', { name: 'Pick photos from your phone' }));
    await screen.findByText('1 photo picked');
    fireEvent.changeText(screen.getByLabelText("What's happening?"), 'First snow!');
    fireEvent.press(screen.getByRole('checkbox', { name: `${DAD}, 3 people` }));
    fireEvent.press(screen.getByRole('button', { name: 'Post' }));

    expect(await screen.findByText(/Didn't send/)).toBeTruthy();
    expect(screen.getByText(REASON)).toBeTruthy();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Try sending again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove this from the list' })).toBeTruthy();
    expect(be.state.clientErrors).toEqual([{ appVersion: expect.any(String), os: expect.any(String), screen: 'upload', kind: 'ApiError', code }]);
  });
});
