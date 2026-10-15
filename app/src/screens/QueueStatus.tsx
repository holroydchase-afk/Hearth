import React from 'react';
import { View } from 'react-native';
import { messageFor } from '../errors/messages';
import { useApp, useJobs } from '../state/AppContext';
import { Button, Card, Txt } from '../ui/kit';
import { photos } from '../ui/format';
import { jobLabel } from '../upload/queue';

/** Shares that haven't finished: progress, "Waiting to send", or what went wrong. */
export function QueueStatus() {
  const { queue, helper } = useApp();
  const jobs = useJobs().filter((j) => j.state !== 'published');
  if (!queue || jobs.length === 0) return null;
  return (
    <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
      {jobs.map((j) => {
        const what = j.caption ? `"${j.caption}"` : photos(j.items.length);
        return (
          <Card key={j.id} testID={`job-${j.id}`}>
            <Txt variant="strong">{`${what}: ${jobLabel(j)}`}</Txt>
            {j.state === 'failed-retryable' ? <Txt variant="muted">We'll keep trying. You can close Hearth; it will finish when you open it again.</Txt> : null}
            {j.state === 'failed' ? (
              <>
                <Txt>{messageFor({ code: j.errorCode }, { inviter: helper, action: 'post' })}</Txt>
                <Button label="Try sending again" text="Try again" onPress={() => queue.retry(j.id)} />
                <Button label="Remove this from the list" text="Remove" variant="secondary" onPress={() => queue.remove(j.id)} />
              </>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}
