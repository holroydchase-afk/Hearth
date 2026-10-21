// BETA-BULK-3: the one review screen before a bulk pick sends.
// "48 photos from 3 days. Send to: Everyone [Change]. Send". The audience is picked once, in
// words, for the whole batch; the default is the last group used, never a silent Everyone.
// No per-photo steps; every action is a labeled button.
import React, { useState } from 'react';
import { Image, View } from 'react-native';
import type { Circle } from '../api/HearthApi';
import { overLimitLine, reviewSummary, skippedVideosLine, type BatchPlan, type PickedAsset } from '../share/bulk';
import type { HelperLine, SetAsideReason } from '../share/helpers';
import { Button, Card, Choice, Loading, Screen, Txt } from '../ui/kit';
import { people, photos } from '../ui/format';

/** R15 photo helpers: what was set aside, in words, each one button from coming back (HELP-R1, HELP-R3). */
export interface ReviewHelpers {
  lines: HelperLine[];
  setAside: PickedAsset[];
  onSendToo: (reason: SetAsideReason) => void;
  onPutBack: (uri: string) => void;
}

export function BatchReview({ plan, circles, chosen, onToggle, onSend, onCancel, busy, helpers }: {
  plan: BatchPlan;
  circles: Circle[] | null;
  chosen: string[];
  onToggle: (circleId: string) => void;
  onSend: () => void;
  onCancel: () => void;
  busy: boolean;
  helpers?: ReviewHelpers;
}) {
  // grandparent-ux: with nobody picked yet, the choices are already open (no hidden step).
  const [changing, setChanging] = useState(chosen.length === 0);
  const [showLeftOut, setShowLeftOut] = useState(false);
  // Everyone first, then the groups (SPEC-GROUPS: 0011 adds a real kind; until then, by name).
  const list = circles ? [...circles].sort((a, b) => Number(b.name === 'Everyone') - Number(a.name === 'Everyone')) : null;
  const names = (list ?? []).filter((g) => chosen.includes(g.circle_id)).map((g) => g.name);
  // Send only to what the screen names: every chosen id must be a loaded group (never unnamed).
  const named = list !== null && chosen.length > 0 && chosen.every((id) => list.some((g) => g.circle_id === id));
  const sendTo = names.length ? `Send to: ${names.join(' and ')}` : 'Send to: nobody yet. Pick who should see these.';
  const skipped = skippedVideosLine(plan.skippedVideos);
  const over = overLimitLine(plan.overLimit);
  const nothing = plan.photoCount === 0;

  return (
    <Screen>
      <Txt variant="display" role="header">{nothing ? 'No photos to send' : reviewSummary(plan)}</Txt>
      {skipped ? <Txt>{skipped}</Txt> : null}
      {over ? <Txt>{over}</Txt> : null}
      {nothing ? null : (
        <Card>
          <Txt variant="strong">{sendTo}</Txt>
          <Button
            label="Change who these go to"
            text={changing ? 'Done choosing' : 'Change'}
            variant="secondary"
            onPress={() => setChanging((v) => !v)}
          />
          {changing && list === null ? <Loading words="Loading your groups…" /> : null}
          {changing
            ? (list ?? []).map((g) => (
              <Choice
                key={g.circle_id}
                kind="checkbox"
                label={`${g.name}, ${people(g.member_count)}`}
                title={`${g.name} · ${people(g.member_count)}`}
                detail={g.member_names.join(', ')}
                checked={chosen.includes(g.circle_id)}
                onPress={() => onToggle(g.circle_id)}
              />
            ))
            : null}
        </Card>
      )}
      {helpers?.lines.length ? (
        // HELP-ALL-1: every helper line together, under "Send to".
        <Card>
          {helpers.lines.map((l) => (
            <View key={l.text} style={{ gap: 8 }}>
              <Txt>{l.text}</Txt>
              {l.button && l.reason ? <Button label={l.button} variant="secondary" onPress={() => helpers.onSendToo(l.reason!)} /> : null}
            </View>
          ))}
          {helpers.setAside.length ? (
            <Button label={showLeftOut ? 'Hide what we left out' : 'Show what we left out'} variant="secondary" onPress={() => setShowLeftOut((v) => !v)} />
          ) : null}
          {showLeftOut ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {helpers.setAside.map((a, i) => (
                <View key={a.uri} style={{ width: 120, gap: 6 }}>
                  <Image source={{ uri: a.uri }} style={{ width: 120, height: 120, borderRadius: 10 }} accessibilityIgnoresInvertColors />
                  <Button label={`Put back photo ${i + 1}`} text="Put back" variant="secondary" onPress={() => helpers.onPutBack(a.uri)} />
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
      {nothing ? null : (
        <Button label={`Send ${photos(plan.photoCount)}`} onPress={onSend} disabled={!named} busy={busy} />
      )}
      <Button label="Don't send these photos" text={nothing ? 'Go back' : "Don't send"} variant="secondary" onPress={onCancel} />
    </Screen>
  );
}
