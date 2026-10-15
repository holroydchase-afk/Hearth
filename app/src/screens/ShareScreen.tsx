// Share: pick → caption → "Who can see it" → Post (BETA-SHARE-1, BETA-AUD-1/2).
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import type { Circle } from '../api/HearthApi';
import { messageFor } from '../errors/messages';
import { loadLastAudience, saveLastAudience } from '../share/audienceMemory';
import { useApp } from '../state/AppContext';
import { useNav } from '../state/nav';
import { Button, Card, Choice, Field, Loading, Notice, Screen, Txt } from '../ui/kit';
import { people, photos } from '../ui/format';
import type { QueueItem } from '../upload/queue';
import { AppGate } from './AppGate';
import { QueueStatus } from './QueueStatus';

const MAX = 10;

export function ShareScreen() {
  const app = useApp();
  const nav = useNav();
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [caption, setCaption] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const userId = app.session?.userId;
  const spaceId = app.space?.space_id;
  const canPost = !!app.space?.can_post;

  useEffect(() => {
    if (!spaceId || !userId || !canPost) return;
    let alive = true;
    (async () => {
      try {
        const list = await app.deps.api.myCircles(spaceId);
        const last = await loadLastAudience(app.deps.kv, userId, list.map((x) => x.circle_id));
        if (!alive) return;
        setCircles(list);
        setChosen(last);
      } catch (e) {
        if (alive) { setCircles([]); setNotice(messageFor(e, { inviter: app.helper })); }
      }
    })();
    return () => { alive = false; };
  }, [spaceId, userId, canPost]); // eslint-disable-line react-hooks/exhaustive-deps

  if (app.status !== 'ready' || !app.space) return <AppGate />;
  if (!canPost || !app.queue) return <Screen><Txt variant="title">You can't do that here.</Txt></Screen>;

  const pick = async () => {
    setNotice(null);
    const r = await app.deps.pickPhotos();
    if ('denied' in r) setNotice('Hearth needs your OK to see your photos. Tap "Allow" when your phone asks.');
    else setItems((cur) => [...cur, ...r.items].slice(0, MAX));
  };

  const toggle = (id: string) => setChosen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const post = async () => {
    if (!items.length || !chosen.length || !app.queue || !userId) return;
    setBusy(true);
    try {
      await saveLastAudience(app.deps.kv, userId, chosen);
      await app.queue.enqueue({ space: app.space!.space_id, caption: caption.trim() || null, circleIds: chosen, items });
      setItems([]);
      setCaption('');
      nav.goPhotos();
    } catch (e) {
      setNotice(messageFor(e, { inviter: app.helper, action: 'post' }));
    } finally {
      setBusy(false);
    }
  };

  const chosenCircles = (circles ?? []).filter((x) => chosen.includes(x.circle_id));
  const ready = items.length > 0 && chosen.length > 0;

  return (
    <Screen>
      <Txt variant="display" role="header">Share photos</Txt>
      <QueueStatus />
      {notice ? <Notice text={notice} onClose={() => setNotice(null)} /> : null}

      <Card>
        <Button label="Pick photos from your phone" text={items.length ? 'Pick more photos' : 'Pick photos'} onPress={() => void pick()} disabled={items.length >= MAX} />
        {items.length ? <Txt variant="strong">{`${photos(items.length)} picked`}</Txt> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {items.map((it, i) => (
            <View key={`${it.uri}-${i}`} style={{ width: 120, gap: 6 }}>
              <Image source={{ uri: it.uri }} style={{ width: 120, height: 120, borderRadius: 10 }} accessibilityIgnoresInvertColors />
              <Button label={`Remove photo ${i + 1}`} text="Remove" variant="secondary" onPress={() => setItems((cur) => cur.filter((_, j) => j !== i))} />
            </View>
          ))}
        </View>
      </Card>

      <Field label="What's happening?" placeholder="Say what's happening (Grandma will see this)" value={caption} onChangeText={setCaption} multiline maxLength={2000} />

      <Card>
        <Txt variant="title" role="header">Who can see it</Txt>
        {circles === null ? <Loading words="Loading your groups…" /> : null}
        {(circles ?? []).map((g) => (
          <Choice
            key={g.circle_id}
            kind="checkbox"
            label={`${g.name}, ${people(g.member_count)}`}
            title={`${g.name} · ${people(g.member_count)}`}
            detail={g.member_names.join(', ')}
            checked={chosen.includes(g.circle_id)}
            onPress={() => toggle(g.circle_id)}
          />
        ))}
        {chosen.length === 0 ? <Txt variant="strong">Pick who should see it.</Txt> : (
          <Txt>{`Only ${chosenCircles.map((g) => g.name).join(' and ')} will see these.`}</Txt>
        )}
      </Card>

      <Button label="Post" onPress={() => void post()} disabled={!ready} busy={busy} />
    </Screen>
  );
}
