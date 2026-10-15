import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { HearthTabBar, tabsFor } from '../TabBar';
import { expectGrandparentSafe } from '../../test/renderApp';

describe('tabs', () => {
  it('viewers get exactly Photos and Help (no Share tab)', () => {
    expect(tabsFor('viewer').map((t) => t.label)).toEqual(['Photos', 'Help']);
    render(<HearthTabBar role="viewer" current="photos" onNavigate={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Photos' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Help' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Share' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Groups' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Me' })).toBeNull();
  });

  it('posters get Photos, Share, Groups and Me', () => {
    expect(tabsFor('owner').map((t) => t.label)).toEqual(['Photos', 'Share', 'Groups', 'Me']);
    expect(tabsFor('adult').map((t) => t.label)).toEqual(['Photos', 'Share', 'Groups', 'Me']);
  });

  it('words under icons, 48 pt, and it navigates', () => {
    const go = jest.fn();
    render(<HearthTabBar role="owner" current="photos" onNavigate={go} />);
    expect(screen.getByText('Share')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Share' }));
    expect(go).toHaveBeenCalledWith('share');
    expect(screen.getByRole('tab', { name: 'Photos' }).props.accessibilityState).toMatchObject({ selected: true });
    expectGrandparentSafe();
  });
});
