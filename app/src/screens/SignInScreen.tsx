import React from 'react';
import { useApp } from '../state/AppContext';
import { useNav } from '../state/nav';
import { Card, Screen, Txt } from '../ui/kit';
import { EmailCodeFlow } from './EmailCodeFlow';

export function SignInScreen() {
  const app = useApp();
  const nav = useNav();
  return (
    <Screen>
      <Txt variant="display" role="header">Welcome to Hearth</Txt>
      <Txt>Private photos of the family. Type your email. We'll send you a 6-number code. No password.</Txt>
      <Card>
        <EmailCodeFlow onSignedIn={async () => { await app.reload(); nav.goPhotos(); }} />
      </Card>
    </Screen>
  );
}
