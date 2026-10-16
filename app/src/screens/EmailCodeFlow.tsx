// Email → 6-digit code. No passwords, no magic links, nothing to copy.
import React, { useState } from 'react';
import { messageFor } from '../errors/messages';
import { useApp } from '../state/AppContext';
import { Button, Field, Notice, Txt } from '../ui/kit';

export function EmailCodeFlow({ onSignedIn, inviter }: { onSignedIn: () => Promise<void>; inviter?: string | null }) {
  const { deps } = useApp();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await deps.api.sendCode(email.trim());
      setStep('code');
      setCode('');
    } catch (e) {
      setMsg(messageFor(e, { inviter }).replace("That didn't work. Please check what you typed and try again.", 'Please check your email address and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await deps.api.verifyCode(email.trim(), code.replace(/\D/g, ''));
      await onSignedIn();
    } catch (e) {
      setMsg(messageFor(e, { inviter }));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'email') {
    return (
      <>
        <Field label="Your email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" placeholder="name@example.com" />
        {msg ? <Notice text={msg} /> : null}
        <Button label="Send me a code" busy={busy} disabled={!email.includes('@')} onPress={() => void send()} />
      </>
    );
  }
  return (
    <>
      <Txt>{`We sent a 6-number code to ${email.trim()}. Type it here.`}</Txt>
      {/* Keep digits only: a pasted "123 456" or "123-456" must not get cut to "123 45". */}
      <Field label="6-number code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={12} autoComplete="one-time-code" textContentType="oneTimeCode" style={{ letterSpacing: 6 }} />
      {msg ? <Notice text={msg} /> : null}
      <Button label="Continue" busy={busy} disabled={code.replace(/\D/g, '').length !== 6} onPress={() => void verify()} />
      <Button label="Send a new code" variant="secondary" onPress={() => void send()} />
      <Button label="Use a different email" variant="quiet" onPress={() => { setStep('email'); setMsg(null); }} />
    </>
  );
}
