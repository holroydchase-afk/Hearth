import React, { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { FeedPost } from '../api/HearthApi';
import type { CommentView } from '../feed/store';
import { useApp, useFeed } from '../state/AppContext';
import { useNav } from '../state/nav';
import { Button, Card, Confirm, Field, Txt } from '../ui/kit';
import { people, photos, shortDate } from '../ui/format';
import { MIN_TARGET, useTheme } from '../ui/theme';
import { MediaImage } from './MediaImage';

const SHOW_INLINE = 4;

export const PostCard = memo(function PostCard({ post }: { post: FeedPost }) {
  const { feed, session } = useApp();
  const nav = useNav();
  const { c } = useTheme();
  const mine = post.author_id === session?.userId;
  const ready = post.media.filter((m) => m.status === 'ready');
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    feed?.markSeen(post);
  }, [feed, post.post_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const audience = post.audience
    ? `Shared with ${post.audience.map((a) => `${a.name} · ${people(a.member_count)}`).join(', ')}`
    : 'Shared with you';

  return (
    <Card testID={`post-${post.post_id}`} style={{ padding: 0, overflow: 'hidden' }}>
      <View style={styles.head}>
        <Txt variant="strong">{post.author_name}</Txt>
        <Txt variant="muted">{shortDate(post.published_at)}</Txt>
      </View>
      {ready.slice(0, SHOW_INLINE).map((m, i) => (
        <Pressable
          key={m.media_id}
          accessibilityRole="button"
          accessibilityLabel={`Open photo ${i + 1} of ${ready.length} full screen`}
          onPress={() => nav.openViewer(post.post_id, i)}
          style={{ width: '100%', aspectRatio: m.width && m.height ? Math.max(0.6, Math.min(1.8, m.width / m.height)) : 4 / 3, minHeight: MIN_TARGET, minWidth: MIN_TARGET }}
        >
          <MediaImage postId={post.post_id} mediaId={m.media_id} style={{ flex: 1 }} />
        </Pressable>
      ))}
      <View style={styles.body}>
        {ready.length > SHOW_INLINE ? (
          <Button label={`See all ${photos(ready.length)}`} variant="secondary" onPress={() => nav.openViewer(post.post_id, SHOW_INLINE)} />
        ) : null}
        {post.caption ? <Txt>{post.caption}</Txt> : null}
        <Txt variant="muted" style={{ color: post.audience ? c.ink : c.safe }}>{audience}</Txt>
        {mine && post.seen_count !== null && post.reach_count !== null ? (
          <Txt variant="strong">{`Seen by ${post.seen_count} of ${post.reach_count}`}</Txt>
        ) : null}
        <Hearts post={post} />
        <Comments post={post} mine={mine} />
        {mine ? (
          <Button label="Delete this photo" text="Delete" variant="secondary" onPress={() => setConfirm(true)} />
        ) : null}
      </View>
      <Confirm
        visible={confirm}
        title="Delete this photo for everyone?"
        body="It will be gone from everyone's phone. This can't be undone."
        yes="Yes, delete it"
        no="No, keep it"
        onNo={() => setConfirm(false)}
        onYes={() => { setConfirm(false); void feed?.deletePost(post.post_id); }}
      />
    </Card>
  );
});

function Hearts({ post }: { post: FeedPost }) {
  const { feed } = useApp();
  const n = post.heart_count;
  return (
    <View style={{ gap: 6 }}>
      <Button
        label="Love it"
        text={post.i_hearted ? '♥ You love this' : '♡ Love it'}
        selected={post.i_hearted}
        variant="secondary"
        onPress={() => void feed?.toggleHeart(post.post_id)}
      />
      {n > 0 ? <Txt variant="muted">{`${n} ${n === 1 ? 'person loves' : 'people love'} this`}</Txt> : null}
    </View>
  );
}

function Comments({ post, mine }: { post: FeedPost; mine: boolean }) {
  const { feed, session } = useApp();
  const state = useFeed();
  const list: CommentView[] = state.comments[post.post_id] ?? [];
  const draft = state.drafts[post.post_id] ?? '';
  const [sent, setSent] = useState(false);
  const prompt = mine ? 'Write something back' : `Write something back to ${post.author_name}`;

  useEffect(() => {
    if (post.comment_count > 0) void feed?.loadComments(post.post_id);
  }, [feed, post.post_id, post.comment_count > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!feed || !session) return;
    setSent(false);
    await feed.addComment(post.post_id, draft, { id: session.userId, name: 'You' });
    const after = feed.getState().comments[post.post_id] ?? [];
    if (after.some((c) => c.status === 'sent' && c.author_id === session.userId)) setSent(true);
  };

  return (
    <View style={{ gap: 8 }}>
      {list.map((c) => (
        <View key={c.client_id ?? c.comment_id} style={{ gap: 4 }}>
          <Txt><Txt variant="strong">{`${c.author_name}: `}</Txt>{c.body}</Txt>
          {c.status === 'sending' ? <Txt variant="muted">Sending…</Txt> : null}
          {c.status === 'failed' ? (
            <>
              <Txt variant="muted">Didn't send.</Txt>
              <Button label="Try sending this again" text="Try again" variant="secondary" onPress={() => void feed?.retryComment(post.post_id, c.client_id!)} />
            </>
          ) : null}
        </View>
      ))}
      <Field
        label={prompt}
        value={draft}
        onChangeText={(t) => { setSent(false); feed?.setDraft(post.post_id, t); }}
        placeholder={prompt}
        multiline
        maxLength={500}
      />
      {/* BETA-REPLY-6: say who can read it, matching the server (everyone the post was shared with). */}
      {sent ? null : <Txt variant="muted">Everyone this photo was shared with can read this.</Txt>}
      <Button label="Send" onPress={() => void send()} disabled={!draft.trim()} />
      {sent ? <Txt variant="muted">Sent. Everyone this photo was shared with can read it.</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: 14 },
  body: { padding: 14, gap: 12 },
});
