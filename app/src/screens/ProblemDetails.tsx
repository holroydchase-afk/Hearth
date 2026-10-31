// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// DBG-3/4: Chase's "dev tools, but straightforward" (Oct 19). Shows the on-device problem log and
// copies it as one plain-text block to paste to Claude. Only in debug builds
// (EXPO_PUBLIC_HEARTH_DEBUG=1); relatives never see it (anchor A1).
import * as Clipboard from 'expo-clipboard';
import React, { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { debugEnabled, entryLines, problems, problemText, subscribeProblems, type ProblemEntry } from '../errors/problemLog';
import { Button, Card, Txt } from '../ui/kit';

let snapshot: ProblemEntry[] = problems();
subscribeProblems(() => { snapshot = problems(); });
const getSnapshot = () => snapshot;

function useProblems(): ProblemEntry[] {
  return useSyncExternalStore(subscribeProblems, getSnapshot, getSnapshot);
}

function CopyForClaude({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Button
        label="Copy problem details for Claude"
        text="Copy for Claude"
        variant="secondary"
        onPress={() => { void Clipboard.setStringAsync(text).then(() => setCopied(true), () => setCopied(false)); }}
      />
      {copied ? <Txt role="alert">Copied. Paste it to Claude.</Txt> : null}
    </>
  );
}

function Entry({ e }: { e: ProblemEntry }) {
  return <Txt selectable>{entryLines(e).join('\n')}</Txt>;
}

/** Help and Me: every problem kept on this phone, newest first. */
export function ProblemDetailsCard() {
  const list = useProblems();
  if (!debugEnabled()) return null;
  return (
    <Card testID="problem-details">
      <Txt variant="title">Problem details</Txt>
      {list.length === 0 ? <Txt>No problems so far.</Txt> : list.map((e, i) => <Entry key={`${e.time}-${i}`} e={e} />)}
      {list.length ? <CopyForClaude text={problemText(list)} /> : null}
    </Card>
  );
}

/** Under a failed upload's reason line. */
export function JobProblemDetails({ jobId }: { jobId: string }) {
  const list = useProblems();
  const [open, setOpen] = useState(false);
  if (!debugEnabled()) return null;
  const e = list.find((x) => x.ref === jobId);
  return (
    <View style={{ gap: 12 }}>
      <Button
        label={open ? 'Hide problem details' : 'Show problem details'}
        text={open ? 'Hide details' : 'Show details'}
        variant="quiet"
        onPress={() => setOpen(!open)}
      />
      {open ? (
        e ? (
          <>
            <Entry e={e} />
            <CopyForClaude text={problemText([e])} />
          </>
        ) : (
          <Txt>No details kept for this one. Details last only until Hearth is closed.</Txt>
        )
      ) : null}
    </View>
  );
}
