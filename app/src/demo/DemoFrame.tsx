// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// DEMO-6 (RR-6): on a laptop, the demo shows the app at phone width beside a short panel for the
// hiring manager: what Hearth is, who it's for, what to try. On a phone it's just the app.
// UI-2: the phone sits centred with a soft shadow, and the panel ends in proof points and one link.
import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { PORTFOLIO_URL } from './DemoBar';

export const APP_COLUMN = 430;
const WIDE = 900;

const TRY = [
  'Scroll Photos. Each card you sent says who it went to.',
  'Tap As Grandma. Grandma Jo sees only what was shared with her side of the family.',
  'Open Share, pick a photo from this computer, and choose who sees it.',
];
const PROOF = ['Private by name', 'Data stays in the US', 'No ads, no AI training'];

export function DemoFrame({ width, children, open = () => {} }: { width: number; children: ReactNode; open?: (url: string) => void }) {
  const { c } = useTheme();
  if (width < WIDE) return <>{children}</>;
  return (
    <View testID="demo-frame" style={[styles.row, { backgroundColor: c.bg }]}>
      <View style={styles.panel}>
        <Txt variant="muted">Hearth (working name) · demo</Txt>
        <Txt variant="display" role="header">A private photo app for split families</Txt>
        <Txt>Every photo goes only to the people you pick, by name. Built for grandparents who stay off social media: big text, words under every icon, no passwords.</Txt>
        <View style={styles.proof}>
          {PROOF.map((p) => (
            <View key={p} style={[styles.pill, { backgroundColor: c.surface, borderColor: c.line }]}><Txt variant="strong">{p}</Txt></View>
          ))}
        </View>
        <Txt variant="title" role="header">Try this</Txt>
        {TRY.map((t, i) => <Txt key={t}>{`${i + 1}. ${t}`}</Txt>)}
        <Button role="link" label="Read the case study on chaseholroyd.com" text="Read the case study" onPress={() => open(PORTFOLIO_URL)} style={styles.cta} />
        <Txt variant="muted">Built test-first by Chase Holroyd, a product manager, with a team of AI agents. The family here is made up and stays in this browser.</Txt>
      </View>
      <View
        testID="demo-app-column"
        style={[styles.app, { width: APP_COLUMN, borderColor: c.line, backgroundColor: c.bg, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 56, padding: 24 },
  panel: { width: 420, gap: 16, justifyContent: 'center' },
  proof: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  cta: { alignSelf: 'flex-start' },
  app: { height: '100%', maxHeight: 880, borderWidth: StyleSheet.hairlineWidth, borderRadius: 28, overflow: 'hidden' },
});
