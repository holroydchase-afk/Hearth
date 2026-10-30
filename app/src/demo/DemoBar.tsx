// DEMO-3 / DEMO-10 (RR-3, RR-10): the bar on every screen of the public demo. It says the family is
// made up and stays in the browser, switches between the parent's and Grandma Jo's view, starts over,
// and leads back to the portfolio. Only rendered in the demo build.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { FakeBackend } from '../api/fake/FakeBackend';
import { Button, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { demoViewer, setDemoViewer } from './seed';

export const PORTFOLIO_URL = 'https://chaseholroyd.com/family-photos.html';

export function DemoBar({ be, reload, startOver, open }: {
  be: FakeBackend;
  /** Reopen Photos so the app picks up the new viewer. */
  reload: () => void;
  startOver: () => void;
  open: (url: string) => void;
}) {
  const { c } = useTheme();
  const viewer = demoViewer(be);
  const swap = () => {
    setDemoViewer(be, viewer === 'parent' ? 'grandma' : 'parent');
    reload();
  };
  return (
    <View style={[styles.bar, { backgroundColor: c.accentSoft, borderBottomColor: c.line }]} testID="demo-bar" accessibilityLabel="About this demo">
      <Txt>
        {viewer === 'parent'
          ? "Made-up family. You're Kai, a parent."
          : "You're Grandma Jo, a grandparent."}
      </Txt>
      <View style={styles.row}>
        <Button
          style={styles.btn}
          variant="secondary"
          label={viewer === 'parent' ? 'See the photos as Grandma Jo sees them' : "Back to Kai's view, the parent"}
          text={viewer === 'parent' ? 'As Grandma' : 'As Kai'}
          onPress={swap}
        />
        <Button style={styles.btn} variant="secondary" label="Start over with the sample family" text="Start over" onPress={startOver} />
        <Button style={styles.btn} variant="secondary" role="link" label="Back to Chase's portfolio" text="Portfolio" onPress={() => open(PORTFOLIO_URL)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // UI-1: one short line and one row of short chips, so the app starts high on a phone.
  bar: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: { flexGrow: 1, paddingHorizontal: 10, paddingVertical: 6 },
});
