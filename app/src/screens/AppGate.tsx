import React, { useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../state/AppContext';
import { useNav } from '../state/nav';
import { Button, Card, Loading, Screen, Txt } from '../ui/kit';
import { InviteCodeEntry } from './InviteCodeEntry';

/** Shown instead of a screen when the app isn't ready for it. Returns null when it is. */
export function AppGate() {
  const app = useApp();
  const nav = useNav();
  const [typing, setTyping] = useState(false);
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
        <Txt>Private photos for your family. Only people your family invites can see them.</Txt>
        <Card>
          <Txt variant="title">New here?</Txt>
          <Txt>Your family sends an invite by text or email. Tap the link in it, or type its code here.</Txt>
          {typing ? <InviteCodeEntry /> : <Button label="I have an invite code" onPress={() => setTyping(true)} />}
        </Card>
        <Card>
          <Txt variant="title">Been here before?</Txt>
          <Button label="Sign in" variant="secondary" onPress={nav.goSignIn} />
        </Card>
      </Screen>
    );
  }
  return (
    <Screen>
      <Card>
        <Txt variant="title" role="header">Almost there</Txt>
        <Txt>You're signed in, but you're not part of a family on Hearth yet. Type the invite code from your family's text or email.</Txt>
        <InviteCodeEntry />
        <Txt variant="muted">No code? Ask the person who invited you to send a new one.</Txt>
        <Button label="Sign out of Hearth" variant="secondary" onPress={() => void app.signOut()} />
      </Card>
    </Screen>
  );
}
