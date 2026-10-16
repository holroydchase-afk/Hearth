// Invite link → "Chase invited you" → email → code → Photos (BETA-JOIN-1/-3, UX-REVIEW #16/#17).
import React, { useEffect, useRef, useState } from 'react';
import { isApiError, type InvitePreview } from '../api/HearthApi';
import { messageFor } from '../errors/messages';
import { useApp } from '../state/AppContext';
import { useNav } from '../state/nav';
import { Button, Card, Loading, Screen, Txt } from '../ui/kit';
import { EmailCodeFlow } from './EmailCodeFlow';

type Step = 'checking' | 'preview' | 'signin' | 'joining' | 'bad';

export function JoinScreen({ code }: { code: string }) {
  const app = useApp();
  const nav = useNav();
  const [step, setStep] = useState<Step>('checking');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [triedEmail, setTriedEmail] = useState<string | null>(null);
  const started = useRef(false);

  const redeem = async (inviter: string | null, email: string | null = null) => {
    setStep('joining');
    try {
      await app.deps.api.redeemInvite(code);
      await app.reload();
      nav.goPhotos();
    } catch (e) {
      // Already in the family (tapped the link twice): just show the photos.
      const spaces = await app.deps.api.mySpaces().catch(() => []);
      if (isApiError(e) && e.code === '22023' && spaces.length > 0) {
        await app.reload();
        nav.goPhotos();
        return;
      }
      setMsg(messageFor(e, { inviter, action: 'join' }));
      // BETA-JOIN-3 keeps "wrong email" and "old invite" identical on the server, so say both here.
      setTriedEmail(isApiError(e) && e.code === '22023' ? email : null);
      setStep('bad');
    }
  };

  useEffect(() => {
    if (app.status === 'loading' || started.current) return;
    started.current = true;
    if (app.session) {
      void redeem(null);
      return;
    }
    app.deps.api.invitePreview(code)
      .then((p) => { setPreview(p); setStep('preview'); })
      .catch((e) => { setMsg(messageFor(e, { action: 'join' })); setStep('bad'); });
  }, [app.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const who = preview?.inviter_name ?? null;

  return (
    <Screen>
      <Txt variant="display" role="header">Hearth</Txt>
      {step === 'checking' || step === 'joining' ? <Loading words={step === 'checking' ? 'Checking your invite…' : 'Opening the photos…'} /> : null}
      {step === 'preview' && preview ? (
        <Card>
          <Txt variant="title">{`${preview.inviter_name} invited you to see the family photos.`}</Txt>
          <Txt>No password. Free.</Txt>
          <Button label="See the photos" onPress={() => setStep('signin')} />
        </Card>
      ) : null}
      {step === 'signin' ? (
        <Card>
          <Txt variant="title">{`Photos from ${who ?? 'your family'}`}</Txt>
          <Txt>Type your email. We'll send you a 6-number code.</Txt>
          <EmailCodeFlow inviter={who} onSignedIn={(email) => redeem(who, email)} />
        </Card>
      ) : null}
      {step === 'bad' && triedEmail ? (
        <Card>
          <Txt variant="title">{`This invite didn't open for ${triedEmail}.`}</Txt>
          <Txt>{`It may be old or already used, or ${who ?? 'your family'} sent it to a different email. Try that email, or ask ${who ?? 'the person who invited you'} for a new invite.`}</Txt>
          <Button label="Try a different email" onPress={() => { void app.signOut().then(() => { setTriedEmail(null); setStep('signin'); }); }} />
        </Card>
      ) : null}
      {step === 'bad' && msg && !triedEmail ? (
        <Card>
          <Txt variant="title">{msg}</Txt>
          <Txt>That's okay, it happens.</Txt>
          {app.session ? null : <Button label="I already have Hearth. Sign in." text="Sign in" variant="secondary" onPress={nav.goSignIn} />}
        </Card>
      ) : null}
    </Screen>
  );
}
