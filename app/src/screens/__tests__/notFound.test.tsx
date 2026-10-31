// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// NF-1 (RR-7): a mistyped or stale link shows plain words and a way back, not Expo's developer page.
import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { expectGrandparentSafe, renderApp } from '../../test/renderApp';
import { NotFoundScreen } from '../NotFoundScreen';

describe('NF-1 page not found', () => {
  it('NF-1 says what happened and leads back to Photos', async () => {
    const { nav } = await renderApp(<NotFoundScreen />, { user: 'chase' });
    expect(screen.getByRole('header', { name: "We couldn't find that page." })).toBeTruthy();
    expect(screen.queryByText(/Unmatched|Sitemap/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Go to Photos' }));
    expect(nav.goPhotos).toHaveBeenCalled();
    expectGrandparentSafe();
  });
});
