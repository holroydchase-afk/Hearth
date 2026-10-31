// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// BETA-NOTIFY-7: posters set the name their family knows them by, once. Notices and
// invites say "From Chase on Hearth", never an email-address placeholder.
import React, { useEffect, useState } from 'react';
import { ApiError } from '../api/HearthApi';
import { useApp } from '../state/AppContext';
import { Button, Card, Field, Txt } from '../ui/kit';

export function YourName() {
  const app = useApp();
  const api = app.deps.api;
  const [ask, setAsk] = useState(false);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.myProfile().then((p) => { if (live && !p.name_set) setAsk(true); }).catch(() => {});
    return () => { live = false; };
  }, [api]);

  if (saved) return <Card><Txt>{`Saved. Your family will see "${saved}".`}</Txt></Card>;
  if (!ask) return null;

  const save = async () => {
    setMsg(null);
    try {
      await api.setMyName(name);
      setSaved(name.trim());
    } catch (e) {
      setMsg(e instanceof ApiError && e.code === '23514'
        ? 'Use the name your family calls you, like "Chase" or "Grandma June".'
        : "Didn't save. Try again in a minute.");
    }
  };

  return (
    <Card>
      <Txt variant="title" role="header">What should your family call you?</Txt>
      <Txt>Your family sees this name on every photo and message you send.</Txt>
      <Field label="Your name" value={name} onChangeText={setName} placeholder='Like "Chase"' maxLength={40} />
      {msg ? <Txt>{msg}</Txt> : null}
      <Button label="Save my name" onPress={() => void save()} disabled={!name.trim()} />
    </Card>
  );
}
