// DEMO-6 (RR-6): on a laptop, the demo shows the app at phone width beside a short panel for the
// hiring manager: what Hearth is, who it's for, what to try. On a phone it's just the app.
import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';

export const APP_COLUMN = 430;
const WIDE = 900;

const TRY = [
  'Scroll Photos. Each card you sent says who it went to.',
  "Tap Grandma's view. She sees only what was shared with her side of the family.",
  'Open Share, pick a photo from this computer, and choose who sees it.',
];

export function DemoFrame({ width, children }: { width: number; children: ReactNode }) {
  const { c } = useTheme();
  if (width < WIDE) return <>{children}</>;
  return (
    <View style={[styles.row, { backgroundColor: c.bg }]}>
      <View style={styles.panel}>
        <Txt variant="muted">Hearth (working name) · demo</Txt>
        <Txt variant="display" role="header">A private photo app for split families</Txt>
        <Txt>Every photo goes only to the people you pick, by name. Built for grandparents who stay off social media: big text, words under every icon, no passwords.</Txt>
        <Txt variant="title" role="header">Try this</Txt>
        {TRY.map((t, i) => <Txt key={t}>{`${i + 1}. ${t}`}</Txt>)}
        <Txt variant="muted">Built test-first by Chase Holroyd, a product manager, with a team of AI agents. The family here is made up.</Txt>
      </View>
      <View testID="demo-app-column" style={[styles.app, { width: APP_COLUMN, borderColor: c.line }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 48, padding: 24 },
  panel: { width: 420, gap: 16, justifyContent: 'center' },
  app: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, overflow: 'hidden' },
});
