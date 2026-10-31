// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import React, { useEffect, useState } from 'react';
import { DEMO_MODE } from '../demo/flags';
import { useApp } from '../state/AppContext';
import { Card, Screen, Txt } from '../ui/kit';
import { AppGate } from './AppGate';
import { NoticeTiming } from './NoticeTiming';
import { ProblemDetailsCard } from './ProblemDetails';
import { BiggerText, DeleteAccount, HowToTell, PhotoHelpers, Privacy, ReplyAudience, SignOut } from './Preferences';

export function MeScreen() {
  const app = useApp();
  if (app.status !== 'ready') return <AppGate />;
  return <MeReady />;
}

/** UI-4: the demo names its made-up person; the real app says which email you signed in with. */
function WhoYouAre() {
  const app = useApp();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!DEMO_MODE) return;
    let live = true;
    app.deps.api.myProfile().then((p) => { if (live) setName(p.display_name); }).catch(() => {});
    return () => { live = false; };
  }, [app.deps.api]);
  if (!DEMO_MODE) return <Txt>{`Signed in as ${app.session?.email ?? ''}`}</Txt>;
  return <Txt>{name ? `You're ${name}, in the made-up sample family.` : "You're in the made-up sample family."}</Txt>;
}

function MeReady() {
  const app = useApp();
  return (
    <Screen>
      <Txt variant="display" role="header">Me</Txt>
      <Card>
        <WhoYouAre />
        <Txt variant="muted">You can share photos and choose who sees them.</Txt>
      </Card>
      <BiggerText />
      <HowToTell />
      <ReplyAudience />
      <PhotoHelpers />
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
