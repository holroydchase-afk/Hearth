import React from 'react';
import { View } from 'react-native';
import { useApp } from '../state/AppContext';
import { useNav } from '../state/nav';
import { Button, Card, Loading, Screen, Txt } from '../ui/kit';

/** Shown instead of a screen when the app isn't ready for it. Returns null when it is. */
export function AppGate() {
  const app = useApp();
  const nav = useNav();
  if (app.status === 'ready') return null;
  if (app.status === 'loading') {
    return (
      <View testID="app-loading" style={{ flex: 1 }}>
        <Screen scroll={false}><Loading words="Opening Hearth…" /></Screen>
      </View>
    );
  }
  if (app.status === 'signedOut') {
    return (
      <Screen>
        <Txt variant="display" role="header">Hearth</Txt>
        <Txt>Private family photos.</Txt>
        <Button label="Sign in" onPress={nav.goSignIn} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Card>
        <Txt variant="title" role="header">Almost there</Txt>
        <Txt>You're signed in, but you're not part of a family on Hearth yet. Ask the person who invited you to send a new invite.</Txt>
        <Button label="Sign out of Hearth" variant="secondary" onPress={() => void app.signOut()} />
      </Card>
    </Screen>
  );
}
