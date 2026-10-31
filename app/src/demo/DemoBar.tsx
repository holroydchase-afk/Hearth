// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// DEMO-BAR (intake #82, pm-tools docs/DEMO-BANNER.md): the studio demo bar on every screen of the public
// demo. Collapsed it is one slim row: the way back, a Demo badge, "Sample data" and Details. Details
// opens a drawer that pushes the app down: the standard copy, Grandma Jo's view (DEMO-10), Reset demo
// (asks first) and the way back in full. Drawn with Hearth's own kit and tokens. Demo build only.
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button, SystemIcon, Txt } from '../ui/kit';
import type { FakeBackend } from '../api/fake/FakeBackend';
import { MIN_TARGET, useTheme } from '../ui/theme';
import { demoViewer, setDemoViewer } from './seed';

export const PORTFOLIO_URL = 'https://chaseholroyd.com/family-photos.html';
const DRAWER_ID = 'demo-details';
const COPY = 'This is the real Hearth, running on made-up sample data. Anything you change is saved only in this browser and is never sent anywhere. Reset demo puts the sample data back.';

export function DemoBar({ be, reload, startOver, open, restored = false }: {
  be: FakeBackend;
  /** Reopen Photos so the app picks up the new viewer. */
  reload: () => void;
  startOver: () => void;
  open: (url: string) => void;
  /** The page was just reset: open the drawer once and say so. */
  restored?: boolean;
}) {
  const { c } = useTheme();
  // The bar's own width: on a laptop it sits in the phone-wide app column, not the whole window.
  const [width, setWidth] = useState(useWindowDimensions().width);
  const [expanded, setExpanded] = useState(restored);
  const [asking, setAsking] = useState(false);
  const toggleRef = useRef<React.ComponentRef<typeof Pressable>>(null);
  const viewer = demoViewer(be);
  const swap = () => {
    setDemoViewer(be, viewer === 'parent' ? 'grandma' : 'parent');
    reload();
  };

  // Esc closes the drawer and puts focus back on Details (WAI-ARIA disclosure).
  useEffect(() => {
    if (Platform.OS !== 'web' || !expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setExpanded(false);
      setAsking(false);
      (toggleRef.current as unknown as { focus?: () => void } | null)?.focus?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  // The spec shows it from 360 px, but at Hearth's 17 pt floor (DS-2) it only fits from 430 px without cutting off.
  const note = width < 430 ? null : width < 600 ? 'Sample data' : 'Sample data · changes stay in this browser';
  return (
    <View
      testID="demo-bar"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      role="region"
      aria-label="Demo"
      // The divider is an inset shadow so the bar stays 48 px with its 48 px targets.
      style={{ backgroundColor: c.surface, boxShadow: `inset 0 -1px 0 ${c.line}` }}
    >
      <View testID="demo-bar-row" style={styles.row}>
        <Pressable
          role="link"
          aria-label="Back to the portfolio"
          onPress={() => open(PORTFOLIO_URL)}
          style={[styles.back, { borderRightColor: c.line }]}
        >
          <Txt style={{ color: c.ink }}>← Portfolio</Txt>
        </Pressable>
        <Pressable
          ref={toggleRef}
          role="button"
          aria-label="Demo details"
          aria-expanded={expanded}
          aria-controls={DRAWER_ID}
          accessibilityState={{ expanded }}
          onPress={() => { setExpanded(!expanded); setAsking(false); }}
          style={styles.toggle}
        >
          <View testID="demo-badge" style={[styles.badge, { borderColor: c.ink, backgroundColor: 'transparent' }]}>
            <Txt variant="strong" style={styles.badgeText}>Demo</Txt>
          </View>
          {note && <Txt variant="muted" numberOfLines={1} style={styles.note}>{note}</Txt>}
          <View style={styles.details}>
            <Txt style={{ color: c.ink }}>Details</Txt>
            <View aria-hidden style={expanded ? styles.chevronOpen : undefined}><SystemIcon icon={{ sf: 'chevron.down', md: 'expand_more' }} color={c.ink} size={16} /></View>
          </View>
        </Pressable>
      </View>
      {expanded && (
        <View nativeID={DRAWER_ID} testID="demo-drawer" style={[styles.drawer, { borderTopColor: c.line }]}>
          {restored && <Txt variant="strong">Sample data restored.</Txt>}
          <Txt style={styles.copy}>{COPY}</Txt>
          <Txt>{viewer === 'parent' ? "You're Kai, a parent." : "You're Grandma Jo, a grandparent."}</Txt>
          <View style={styles.actions}>
            <Button
              variant="secondary"
              label={viewer === 'parent' ? 'See the photos as Grandma Jo sees them' : "Back to Kai's view, the parent"}
              text={viewer === 'parent' ? 'See it as Grandma Jo' : "Back to Kai's view"}
              onPress={swap}
            />
            {asking ? (
              <View style={[styles.ask, { borderColor: c.line }]}>
                <Txt>Put the sample data back? Your changes will be lost.</Txt>
                <View style={styles.askRow}>
                  <Button style={styles.grow} variant="danger" label="Reset" onPress={startOver} />
                  <Button style={styles.grow} variant="secondary" label="Keep" onPress={() => setAsking(false)} />
                </View>
              </View>
            ) : (
              <Pressable
                role="button"
                aria-label="Reset demo"
                onPress={() => setAsking(true)}
                style={[styles.outline, { borderColor: c.line }]}
              >
                <Txt style={{ color: c.ink }}>Reset demo</Txt>
              </Pressable>
            )}
            <Pressable role="link" aria-label="Back to the Hearth case study" onPress={() => open(PORTFOLIO_URL)} style={styles.link}>
              <Txt style={{ color: c.accent }}>← Back to the Hearth case study</Txt>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // One 48 px row (Hearth's tap target, the spec's ceiling), never sticky.
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TARGET, maxHeight: MIN_TARGET },
  back: { minHeight: MIN_TARGET, justifyContent: 'center', paddingHorizontal: 12, borderRightWidth: StyleSheet.hairlineWidth },
  toggle: { flex: 1, minHeight: MIN_TARGET, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10, paddingRight: 12 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8 },
  badgeText: { fontVariant: ['small-caps'], letterSpacing: 0.5 },
  note: { flexShrink: 1 },
  details: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  drawer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12, gap: 10, maxWidth: 640 },
  copy: { maxWidth: 560 },
  actions: { gap: 8, alignItems: 'flex-start' },
  ask: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 8, alignSelf: 'stretch' },
  askRow: { flexDirection: 'row', gap: 8 },
  grow: { flexGrow: 1 },
  outline: { minHeight: MIN_TARGET, justifyContent: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 16 },
  link: { minHeight: MIN_TARGET, justifyContent: 'center' },
});
