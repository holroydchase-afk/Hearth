import React from 'react';
import { DEMO_MODE } from '../demo/flags';
import { useApp } from '../state/AppContext';
import { Card, Screen, Txt } from '../ui/kit';
import { AppGate } from './AppGate';
import { NoticeTiming } from './NoticeTiming';
import { ProblemDetailsCard } from './ProblemDetails';
import { BiggerText, DeleteAccount, HowToTell, Privacy, ReplyAudience, SignOut } from './Preferences';

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
      <ReplyAudience />
      <Privacy who={app.helper} />
      {/* DEMO-8: the public demo has no test tools and no way out of the sample family but Start over. */}
      {DEMO_MODE ? null : (
        <>
          <NoticeTiming />
          <ProblemDetailsCard />
          <SignOut />
          <DeleteAccount />
        </>
      )}
    </Screen>
  );
}
