// Share: pick → caption → "Who can see it" → Post (BETA-SHARE-1, BETA-AUD-1/2).
import React, { useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import type { Circle } from '../api/HearthApi';
import { messageFor } from '../errors/messages';
import { loadLastAudience, saveLastAudience } from '../share/audienceMemory';
import { planBatch, type PickedAsset } from '../share/bulk';
import { applyHelpers, findLookAlikes, helperLines, type LookResult } from '../share/helpers';
import { useApp } from '../state/AppContext';
import { useNav } from '../state/nav';
import { Button, Card, Choice, Field, Loading, Notice, Screen, Txt } from '../ui/kit';
import { people, photos } from '../ui/format';
import type { QueueItem } from '../upload/queue';
import { AppGate } from './AppGate';
import { BatchReview } from './BatchReview';
import { QueueStatus } from './QueueStatus';

const MAX = 10;

/** BETA-AUD-17 (SPEC-GROUPS): Everyone first (1 tap), then groups and households, then events. */
const KIND_ORDER: Record<string, number> = { everyone: 0, group: 1, household: 2, event: 3 };
export function shareOrder(list: Circle[]): Circle[] {
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (KIND_ORDER[a.x.kind ?? 'group'] ?? 1) - (KIND_ORDER[b.x.kind ?? 'group'] ?? 1) || a.i - b.i)
    .map((a) => a.x);
}

export function ShareScreen() {
  const app = useApp();
  const nav = useNav();
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [caption, setCaption] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // BETA-BULK-3: a bulk pick waiting on the review screen (dates only; EXIF already dropped).
  // R15: the bulk pick as picked; photo helpers set some aside (never deleted), and putBack brings them back.
  const [picked, setPicked] = useState<PickedAsset[] | null>(null);
  const [putBack, setPutBack] = useState<Set<string>>(() => new Set());
  const [looks, setLooks] = useState<LookResult | null>(null);
  const helped = useMemo(() => (picked ? applyHelpers(picked, { putBack, looks }) : null), [picked, putBack, looks]);
  const plan = useMemo(() => (helped ? planBatch(helped.kept) : null), [helped]);
  const setPlan = (assets: PickedAsset[] | null) => { setPicked(assets); setPutBack(new Set()); setLooks(null); };
  // HELP-DUP-3, HELP-BLUR: read small previews after the review screen shows; Send never waits for them.
  const previewBytes = app.deps.previewBytes;
  useEffect(() => {
    if (!picked || !previewBytes) return;
    let alive = true;
    const candidates = applyHelpers(picked).kept;
    void findLookAlikes(candidates, previewBytes).then((r) => { if (alive) setLooks(r); }).catch(() => {});
    return () => { alive = false; };
  }, [picked, previewBytes]);
  const userId = app.session?.userId;
  const spaceId = app.space?.space_id;
  const canPost = !!app.space?.can_post;
  // Oct 17 decision: "Pick lots of photos" is for parents only, never a relative allowed to post.
  const isParent = app.space?.role === 'owner' || app.space?.role === 'adult';
  // FLAG-5: video is offered only when the server has video_posting on for me.
  const videos = app.features.includes('video_posting');

  useEffect(() => {
    if (!spaceId || !userId || !canPost) return;
    let alive = true;
    (async () => {
      try {
        // BETA-AUD-21 (grandparent-ux UX-G3): only parents send to Everyone, so a relative is never offered it.
        const list = shareOrder(await app.deps.api.myCircles(spaceId)).filter((x) => isParent || x.kind !== 'everyone');
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
    const r = await app.deps.pickPhotos({ videos });
    if ('denied' in r) setNotice('Hearth needs your OK to see your photos. Tap "Allow" when your phone asks.');
    else setItems((cur) => [...cur, ...r.items].slice(0, MAX));
  };

  const pickMany = async () => {
    if (!app.deps.pickBulk) return;
    setNotice(null);
    const r = await app.deps.pickBulk();
    if ('denied' in r) setNotice('Hearth needs your OK to see your photos. Tap "Allow" when your phone asks.');
    else if (r.assets.length) setPlan(r.assets);
  };

  const sendBatch = async () => {
    if (!plan || !plan.posts.length || !chosen.length || !app.queue || !userId) return;
    setBusy(true);
    try {
      await saveLastAudience(app.deps.kv, userId, chosen);
      await app.queue.enqueueBatch({
        space: app.space!.space_id, circleIds: chosen,
        posts: plan.posts.map((p) => ({ takenAt: p.takenAt, items: p.items })),
      });
      setPlan(null);
      nav.goPhotos();
    } catch (e) {
      setNotice(messageFor(e, { inviter: app.helper, action: 'post' }));
    } finally {
      setBusy(false);
    }
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

  if (plan && helped) {
    const bringBack = (uris: string[]) => setPutBack((cur) => new Set([...cur, ...uris]));
    return (
      <BatchReview plan={plan} circles={circles} chosen={chosen} onToggle={toggle} busy={busy}
        onSend={() => void sendBatch()} onCancel={() => setPlan(null)}
        helpers={{
          lines: helperLines(helped),
          setAside: helped.setAside.flatMap((s) => s.items),
          onSendToo: (reason) => bringBack(helped.setAside.filter((s) => s.reason === reason).flatMap((s) => s.items.map((a) => a.uri))),
          onPutBack: (uri) => bringBack([uri]),
        }} />
    );
  }

  const chosenCircles = (circles ?? []).filter((x) => chosen.includes(x.circle_id));
  const ready = items.length > 0 && chosen.length > 0;

  return (
    <Screen>
      <Txt variant="display" role="header">Share photos</Txt>
      <QueueStatus />
      {notice ? <Notice text={notice} onClose={() => setNotice(null)} /> : null}

      <Card>
        <Button
          label={videos ? 'Pick photos or videos from your phone' : 'Pick photos from your phone'}
          text={videos ? (items.length ? 'Pick more photos or videos' : 'Pick photos or videos') : (items.length ? 'Pick more photos' : 'Pick photos')} onPress={() => void pick()} disabled={items.length >= MAX} />
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
        {(circles ?? []).map((g, i, all) => (
          <React.Fragment key={g.circle_id}>
          {g.kind !== 'everyone' && g.kind !== 'event' && (i === 0 || all[i - 1]?.kind === 'everyone') ? (
            <Txt variant="strong" role="header">Groups</Txt>
          ) : null}
          {g.kind === 'event' && all[i - 1]?.kind !== 'event' ? (
            <>
              <Txt variant="strong" role="header">Events</Txt>
              <Txt variant="muted">Everyone in an event reads each other's comments on its photos.</Txt>
            </>
          ) : null}
          <Choice
            kind="checkbox"
            label={`${g.name}, ${people(g.member_count)}`}
            title={`${g.name} · ${people(g.member_count)}`}
            detail={g.member_names.join(', ')}
            checked={chosen.includes(g.circle_id)}
            onPress={() => toggle(g.circle_id)}
          />
          </React.Fragment>
        ))}
        {chosen.length === 0 ? <Txt variant="strong">Pick who should see it.</Txt> : (
          <Txt>{chosenCircles.some((g) => g.kind === 'everyone')
            ? 'Everyone in the family will see these.'
            : `Only ${chosenCircles.map((g) => g.name).join(' and ')} will see these.`}</Txt>
        )}
      </Card>

      <Button label="Post" onPress={() => void post()} disabled={!ready} busy={busy} />

      {app.deps.pickBulk && isParent ? (
        <Card>
          <Txt variant="title" role="header">Lots of photos?</Txt>
          <Txt>Pick up to 100. Hearth puts them in order by the day they were taken.</Txt>
          <Button label="Pick up to 100 photos at once" text="Pick lots of photos" variant="secondary" onPress={() => void pickMany()} />
        </Card>
      ) : null}
    </Screen>
  );
}
