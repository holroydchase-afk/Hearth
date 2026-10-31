// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Help tab for viewers (UX-REVIEW #11-#15): Call Chase first, Bigger text on by default.
import React from 'react';
import { useApp } from '../state/AppContext';
import { Button, Card, Screen, Txt } from '../ui/kit';
import { AppGate } from './AppGate';
import { ProblemDetailsCard } from './ProblemDetails';
import { BiggerText, DeleteAccount, HowToTell, Privacy, SignOut } from './Preferences';

export function HelpScreen() {
  const app = useApp();
  if (app.status !== 'ready') return <AppGate />;
  const who = app.helper;
  const phone = app.deps.helpPhone?.replace(/[^+\d]/g, '') || null;
  return (
    <Screen>
      <Txt variant="display" role="header">Help</Txt>
      <Card>
        <Txt variant="title">Need help?</Txt>
        {who && phone ? (
          <Button label={`Call ${who}`} icon={{ sf: 'phone.fill', md: 'call' }} onPress={() => void app.deps.openUrl(`tel:${phone}`)} />
        ) : (
          <Txt>{`Ask ${who ?? 'the person who invited you'} for help.`}</Txt>
        )}
      </Card>
      <BiggerText />
      <HowToTell />
      <Privacy who={who} />
      <Card>
        <Txt>You can look at photos and write back.</Txt>
      </Card>
      <ProblemDetailsCard />
      <SignOut />
      <DeleteAccount />
    </Screen>
  );
}
