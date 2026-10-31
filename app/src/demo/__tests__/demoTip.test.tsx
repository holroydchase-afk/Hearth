// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// DEMO-BAR review (ux-reviewer P1): on a phone nothing pointed to Grandma Jo's view once it moved into
// the Details drawer, so Photos shows one tip line there. The laptop's story panel already says it.
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { DemoTip, demoTip } from '../DemoTip';

describe('DEMO-BAR phone tip', () => {
  it("DEMO-BAR the parent's Photos on a phone points to Details, then Grandma Jo", () => {
    expect(demoTip(390, 'parent')).toBe('Tip: tap Details, then See it as Grandma Jo.');
    expect(demoTip(899, 'parent')).not.toBeNull();
  });

  it('DEMO-BAR no tip beside the laptop story panel or in Grandma Jo\'s own view', () => {
    expect(demoTip(1280, 'parent')).toBeNull();
    expect(demoTip(390, 'grandma')).toBeNull();
  });

  it('DEMO-BAR the tip is one muted line', () => {
    render(<DemoTip text="Tip: tap Details, then See it as Grandma Jo." />);
    expect(screen.getByText('Tip: tap Details, then See it as Grandma Jo.')).toBeTruthy();
  });
});
