// Email → 6-digit code. No passwords, no magic links, nothing to copy.
import React, { useEffect, useState } from 'react';
import { messageFor } from '../errors/messages';
import { useApp } from '../state/AppContext';
import { suggestEmail } from '../ui/emailSuggest';
import { Button, Field, Notice, Txt } from '../ui/kit';

export function EmailCodeFlow({ onSignedIn, inviter }: { onSignedIn: (email: string) => Promise<void>; inviter?: string | null }) {
  const { deps } = useApp();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // BETA-JOIN-2: a minute between codes (the mailer allows only a few an hour), said in words.
  const [waitUntil, setWaitUntil] = useState(0);
  const [sentTo, setSentTo] = useState<string | null>(null); // HARD-5: the minute counts for the address it was sent to
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const t = setInterval(() => { const n = Date.now(); setNow(n); if (n >= waitUntil) clearInterval(t); }, 1000);
    return () => clearInterval(t);
  }, [waitUntil]);
  const waitLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await deps.api.sendCode(email.trim());
      setSentTo(email.trim().toLowerCase());
      setStep('code');
      setCode('');
      setNow(Date.now());
      setWaitUntil(Date.now() + 60_000);
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
      await onSignedIn(email.trim());
    } catch (e) {
      setMsg(messageFor(e, { inviter }));
    } finally {
      setBusy(false);
    }
  };

  const suggestion = suggestEmail(email);
  const mustWait = waitLeft > 0 && sentTo === email.trim().toLowerCase();

  if (step === 'email') {
    return (
      <>
        <Field label="Your email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" placeholder="name@example.com" />
        {suggestion ? (
          <>
            <Txt>{`Did you mean ${suggestion}?`}</Txt>
            <Button label={`Use ${suggestion}`} variant="secondary" onPress={() => setEmail(suggestion)} />
          </>
        ) : null}
        {msg ? <Notice text={msg} /> : null}
        <Button label="Send me a code" busy={busy} disabled={!email.includes('@') || mustWait} onPress={() => void send()} />
        {mustWait ? <Txt variant="muted">{`You can ask for a new code in ${waitLeft} seconds.`}</Txt> : null}
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
      <Txt variant="muted">It can take a minute. Not there? Look in your Junk or Spam folder.</Txt>
      {waitLeft > 0 ? <Txt variant="muted">{`You can ask for a new code in ${waitLeft} seconds.`}</Txt> : null}
      <Button label="Send a new code" variant="secondary" disabled={waitLeft > 0} onPress={() => void send()} />
      <Button label="Use a different email" variant="quiet" onPress={() => { setStep('email'); setMsg(null); }} />
    </>
  );
}
