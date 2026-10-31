// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Blocks shared by Help (viewers) and Me (posters): Bigger text, notice choice, privacy, sign out.
import React, { useState } from 'react';
import { useApp } from '../state/AppContext';
import { HELPER_FEATURES } from '../share/helpers';
import type { NotifyChoice } from '../state/prefs';
import { Button, Card, Choice, Confirm, Notice, Txt } from '../ui/kit';

export function BiggerText() {
  const { prefs, setPrefs } = useApp();
  return (
    <Card>
      <Choice
        kind="switch"
        label="Bigger text"
        title="Bigger text"
        detail={prefs.bigText ? 'Words are extra large.' : 'Tap to make the words bigger.'}
        checked={prefs.bigText}
        onPress={() => setPrefs({ bigText: !prefs.bigText })}
      />
    </Card>
  );
}

const CHOICES: { id: NotifyChoice; title: string; saved: string }[] = [
  { id: 'push', title: 'A sound on your phone when there are new photos (Recommended)', saved: 'Saved. Your phone will make a sound when there are new photos.' },
  { id: 'evening', title: "An email every evening with the day's new photos", saved: "Saved. We'll email you every evening when there are new photos." },
  { id: 'sunday', title: 'An email every Sunday morning', saved: "Saved. We'll email you on Sunday mornings when there are new photos." },
];

export function HowToTell() {
  const { prefs, saveNotify } = useApp();
  const [saved, setSaved] = useState<{ text: string; good: boolean } | null>(null);
  return (
    <Card>
      <Txt variant="title" role="header">How should we tell you about new photos?</Txt>
      {CHOICES.map((c) => (
        <Choice
          key={c.id}
          kind="radio"
          label={c.title}
          title={c.title}
          checked={prefs.notify === c.id}
          onPress={() => {
            setSaved(null);
            void saveNotify(c.id).then((ok) => setSaved(ok
              ? { text: c.saved, good: true }
              : { text: "Didn't save. Check your signal, then tap your choice again.", good: false }));
          }}
        />
      ))}
      {saved ? <Notice text={saved.text} tone={saved.good ? 'good' : 'info'} /> : null}
    </Card>
  );
}

const HELPERS = [
  { feature: HELPER_FEATURES.duplicates, title: 'Set aside repeats', detail: 'The same photo twice, look-alikes, and photos sent in the last 30 days.' },
  { feature: HELPER_FEATURES.screensBlur, title: 'Set aside screenshots and blurry photos', detail: "Pictures of a phone's screen, and photos that came out blurry." },
];

/** HELP-R6 (R17): the family's owner turns the photo helpers off and on for everyone who shares (DEC-18). */
export function PhotoHelpers() {
  const { space, features, setFamilyFeature } = useApp();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!space || space.role !== 'owner') return null;
  return (
    <Card>
      <Txt variant="title" role="header">Photo helpers</Txt>
      <Txt variant="muted">When anyone picks 4 or more photos to send, Hearth can set some aside first. Each one has a Put back button. Nothing is deleted from the phone. These switches are for the whole family.</Txt>
      {HELPERS.map((h) => {
        const on = features.includes(h.feature);
        return (
          <Choice
            key={h.feature}
            kind="switch"
            label={h.title}
            title={h.title}
            detail={h.detail}
            checked={on}
            onPress={() => {
              if (busy) return;
              setBusy(true);
              setNote(null);
              void setFamilyFeature(h.feature, !on).then((ok) => {
                setBusy(false);
                if (!ok) setNote("Didn't save. Check your signal, then tap the switch again.");
              });
            }}
          />
        );
      })}
      {note ? <Notice text={note} tone="info" /> : null}
    </Card>
  );
}

export function Privacy({ who }: { who: string | null }) {
  return (
    <Card>
      <Txt variant="title" role="header">Keeping your photos private</Txt>
      <Txt>Your photos stay in the United States.</Txt>
      <Txt>No one outside the family can see them. No ads, no strangers.</Txt>
      <Txt>No computer program learns from your photos.</Txt>
      <Txt>Photos don't show where they were taken.</Txt>
      <Txt>{`${who ?? 'You'} can delete everything at any time.`}</Txt>
    </Card>
  );
}

export function SignOut() {
  const { signOut } = useApp();
  const [ask, setAsk] = useState(false);
  return (
    <>
      <Button label="Sign out of Hearth" variant="secondary" onPress={() => setAsk(true)} />
      <Confirm
        visible={ask}
        title="Sign out of Hearth?"
        body="To come back, you'll need a new code from your email."
        yes="Yes, sign out"
        no="No, stay signed in"
        onNo={() => setAsk(false)}
        onYes={() => { setAsk(false); void signOut(); }}
      />
    </>
  );
}

/** BETA-JOIN-7. Not offered to the space's owner: what happens to the family's photos is Chase's call. */
export function DeleteAccount() {
  const app = useApp();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!app.space || app.space.role === 'owner') return null;
  const yes = async () => {
    setAsk(false);
    try {
      await app.deps.api.requestAccountDeletion();
      await app.signOut();
    } catch {
      setMsg("Didn't work. Try again in a minute.");
    }
  };
  return (
    <>
      <Button label="Take me off Hearth" variant="secondary" onPress={() => setAsk(true)} />
      {msg ? <Txt>{msg}</Txt> : null}
      <Confirm
        visible={ask}
        title="Take you off Hearth?"
        body="This takes you off Hearth for good. Your comments and hearts are removed. This can't be undone."
        yes="Yes, take me off Hearth"
        no="No, stay on Hearth"
        onNo={() => setAsk(false)}
        onYes={() => void yes()}
      />
    </>
  );
}

/** BETA-AUD-10: the family owner picks who reads what relatives write. Safest is the default. */
export function ReplyAudience() {
  const app = useApp();
  const [choice, setChoice] = useState(app.space?.reply_audience ?? 'parents');
  const [failed, setFailed] = useState(false);
  if (!app.space || app.space.role !== 'owner') return null;
  const pick = (c: 'parents' | 'everyone') => {
    const before = choice;
    setChoice(c);
    setFailed(false);
    app.deps.api.setReplyAudience(app.space!.space_id, c).catch(() => { setChoice(before); setFailed(true); });
  };
  return (
    <Card>
      <Txt variant="title" role="header">Who reads what family members write</Txt>
      <Txt variant="muted">For comments and hearts. The kids' parents read them all, and your own replies reach everyone the photo went to. People in the same household, or in the same event, read each other's.</Txt>
      <Choice kind="radio" label="The parents, plus their own household and events (safest)" title="The parents, plus their own household and events (safest)" detail="A grandparent's comment reaches you, the other parent, and their own household. Never the other side." checked={choice === 'parents'} onPress={() => pick('parents')} />
      <Choice kind="radio" label="Everyone the photo was shared with" title="Everyone the photo was shared with" detail="Divorced grandparents on the same photo will read each other's comments." checked={choice === 'everyone'} onPress={() => pick('everyone')} />
      {failed ? <Notice text="Didn't save. Check your internet and try again." /> : null}
    </Card>
  );
}
