// AE-10 / BETA-NOTIFY-1: how fast notices reached this phone, for the milestone 2 check.
// Read from this phone only; "Copy the report" is the only way it leaves, and only by choice.
import React, { useState } from 'react';
import { Share } from 'react-native';
import { loadArrivals, timingReport } from '../notify/latency';
import { useApp } from '../state/AppContext';
import { Button, Card, Txt } from '../ui/kit';

export function NoticeTiming() {
  const app = useApp();
  const [text, setText] = useState<string | null>(null);
  const show = async () => {
    if (!app.session || !app.feed) return;
    const arrivals = await loadArrivals(app.deps.kv, app.session.userId);
    setText(timingReport(arrivals, app.feed.getState().posts).text);
  };
  return (
    <Card>
      <Txt variant="title" role="header">Notice timing</Txt>
      <Txt variant="muted">For testing: how fast notices reach this phone. It stays on this phone.</Txt>
      {text ? (
        <>
          <Txt selectable>{text}</Txt>
          <Button label="Copy the report" variant="secondary" onPress={() => void Share.share({ message: text })} />
        </>
      ) : (
        <Button label="Show notice timing" variant="secondary" onPress={() => void show()} />
      )}
    </Card>
  );
}
