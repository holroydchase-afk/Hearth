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
          ? "A demo with a made-up family, kept in this browser. You're Sam, a parent."
          : "A demo with a made-up family, kept in this browser. You're Grandma Jo: you see only what's shared with you."}
      </Txt>
      <View style={styles.row}>
        <Button
          style={styles.btn}
          variant="secondary"
          label={viewer === 'parent' ? 'See the photos as Grandma Jo sees them' : "Back to Sam's view, the parent"}
          text={viewer === 'parent' ? "Grandma's view" : "Parent's view"}
          onPress={swap}
        />
        <Button style={styles.btn} variant="secondary" label="Start over with the sample family" text="Start over" onPress={startOver} />
        <Button style={styles.btn} variant="quiet" role="link" label="Back to Chase's portfolio" text="Portfolio" onPress={() => open(PORTFOLIO_URL)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexGrow: 1, flexBasis: 100 },
});
