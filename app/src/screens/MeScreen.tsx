import React from 'react';
import { useApp } from '../state/AppContext';
import { Card, Screen, Txt } from '../ui/kit';
import { AppGate } from './AppGate';
import { NoticeTiming } from './NoticeTiming';
import { BiggerText, DeleteAccount, HowToTell, Privacy, SignOut } from './Preferences';

export function MeScreen() {
  const app = useApp();
  if (app.status !== 'ready') return <AppGate />;
  return (
    <Screen>
      <Txt variant="display" role="header">Me</Txt>
      <Card>
        <Txt>{`Signed in as ${app.session?.email ?? ''}`}</Txt>
        <Txt variant="muted">You can share photos and choose who sees them.</Txt>
      </Card>
      <BiggerText />
      <HowToTell />
      <Privacy who={app.helper} />
      <NoticeTiming />
      <SignOut />
      <DeleteAccount />
    </Screen>
  );
}
