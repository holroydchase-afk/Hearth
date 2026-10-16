// BETA-JOIN-8: the way in when a link opens in a browser, or someone reads the code out loud.
// Any case, spaces or dashes; the code is 10 letters and numbers (no 0/O/1/I/L/U).
import React, { useState } from 'react';
import { useNav } from '../state/nav';
import { Button, Field, Txt } from '../ui/kit';

export const normalizeInviteCode = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function InviteCodeEntry() {
  const nav = useNav();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const open = () => {
    const c = normalizeInviteCode(code);
    if (c.length !== 10) {
      setMsg('An invite code has 10 letters and numbers. Check the text or email from your family.');
      return;
    }
    setMsg(null);
    nav.goJoin(c);
  };
  return (
    <>
      <Field label="Invite code" value={code} onChangeText={setCode} placeholder='Like "ABCDE FGHJK"' autoCapitalize="characters" autoCorrect={false} maxLength={20} />
      {msg ? <Txt>{msg}</Txt> : null}
      <Button label="Open the invite" onPress={open} disabled={!code.trim()} />
    </>
  );
}
