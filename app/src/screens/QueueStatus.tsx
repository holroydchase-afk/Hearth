// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import React from 'react';
import { View } from 'react-native';
import { ApiError } from '../api/HearthApi';
import { messageFor } from '../errors/messages';
import { useApp, useJobs } from '../state/AppContext';
import { Button, Card, Txt } from '../ui/kit';
import { photos } from '../ui/format';
import { batchLabel, jobLabel } from '../upload/queue';
import { JobProblemDetails } from './ProblemDetails';

/** Shares that haven't finished: progress, "Waiting to send", or what went wrong. */
export function QueueStatus() {
  const { queue, helper } = useApp();
  const all = useJobs();
  const jobs = all.filter((j) => j.state !== 'published');
  if (!queue || jobs.length === 0) return null;
  // BETA-BULK-4: a bulk pick is one line, "Sending 12 of 48 photos…", not one card per post.
  const batches = [...new Set(jobs.filter((j) => j.batchId && j.state !== 'failed').map((j) => j.batchId!))];
  const single = jobs.filter((j) => !j.batchId || j.state === 'failed');
  return (
    <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
      {batches.map((b) => {
        const p = queue.batchProgress(b);
        const waiting = jobs.some((j) => j.batchId === b && j.state === 'failed-retryable');
        return (
          <Card key={b} testID={`batch-${b}`}>
            <Txt variant="strong">
              {!waiting ? batchLabel(p) : p.done > 0 ? `Sent ${p.done} of ${photos(p.total)}. Waiting to send the rest.` : `${photos(p.total)} waiting to send`}
            </Txt>
            {waiting ? <Txt variant="muted">We'll keep trying. You can close Hearth; it will finish when you open it again.</Txt> : null}
          </Card>
        );
      })}
      {single.map((j) => {
        const what = j.caption ? `"${j.caption}"` : photos(j.items.length);
        return (
          <Card key={j.id} testID={`job-${j.id}`}>
            <Txt variant="strong">{`${what}: ${jobLabel(j)}`}</Txt>
            {j.state === 'failed-retryable' ? <Txt variant="muted">We'll keep trying. You can close Hearth; it will finish when you open it again.</Txt> : null}
            {j.state === 'failed' ? (
              <>
                <Txt>{messageFor(new ApiError(j.errorCode ?? 'UNKNOWN'), { inviter: helper, action: 'post' })}</Txt>
                <JobProblemDetails jobId={j.id} />
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
