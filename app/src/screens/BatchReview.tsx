// BETA-BULK-3: the one review screen before a bulk pick sends.
// "48 photos from 3 days. Send to: Everyone [Change]. Send". The audience is picked once, in
// words, for the whole batch; the default is the last group used, never a silent Everyone.
// No per-photo steps; every action is a labeled button.
import React, { useState } from 'react';
import type { Circle } from '../api/HearthApi';
import { overLimitLine, reviewSummary, skippedVideosLine, type BatchPlan } from '../share/bulk';
import { Button, Card, Choice, Loading, Screen, Txt } from '../ui/kit';
import { people, photos } from '../ui/format';

export function BatchReview({ plan, circles, chosen, onToggle, onSend, onCancel, busy }: {
  plan: BatchPlan;
  circles: Circle[] | null;
  chosen: string[];
  onToggle: (circleId: string) => void;
  onSend: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [changing, setChanging] = useState(false);
  // Everyone first, then the groups (SPEC-GROUPS: 0011 adds a real kind; until then, by name).
  const list = circles ? [...circles].sort((a, b) => Number(b.name === 'Everyone') - Number(a.name === 'Everyone')) : null;
  const names = (list ?? []).filter((g) => chosen.includes(g.circle_id)).map((g) => g.name);
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
      {nothing ? null : (
        <Button label={`Send ${photos(plan.photoCount)}`} onPress={onSend} disabled={chosen.length === 0} busy={busy} />
      )}
      <Button label="Don't send these photos" text={nothing ? 'Go back' : "Don't send"} variant="secondary" onPress={onCancel} />
    </Screen>
  );
}
