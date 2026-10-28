// BETA-TIME-2..4: photos by the date they were taken, with big month headers ("July 2024"),
// a "Pick a year" list, and "Show older photos". Every action is a labeled button: no
// scrubber, no gesture-only control. Opened from Photos ("Show by date" or a card's "See them").
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BackHandler, FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TimelinePost } from '../api/HearthApi';
import { TimelineStore, startOfNextYear, timelineRows, type TimelineRow } from '../feed/timeline';
import { useApp, useFeed } from '../state/AppContext';
import { Button, Card, Loading, Notice, Txt } from '../ui/kit';
import { photos, shortDate } from '../ui/format';
import { MIN_TARGET, useTheme } from '../ui/theme';
import { MediaImage } from './MediaImage';
import { PostCard } from './PostCard';

const SHOW_INLINE = 4;

export function TimelineScreen({ startAt, onClose }: { startAt: string | null; onClose: () => void }) {
  const app = useApp();
  const { c } = useTheme();
  const store = useMemo(
    () => new TimelineStore({ api: app.deps.api, space: app.space!.space_id, inviter: app.helper }),
    [app.deps.api, app.space?.space_id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const [years, setYears] = useState(false);
  // BETA-TIME-2: a card opens the full post (hearts and replies), with a labeled way back.
  const [openId, setOpenId] = useState<string | null>(null);
  const feedState = useFeed();

  useEffect(() => { void store.open(startAt); }, [store, startAt]);

  // Android (Grandaddy, Pawpaw): the phone's Back button steps back inside Hearth, never out of it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (openId) setOpenId(null);
      else if (years) setYears(false);
      else onClose();
      return true;
    });
    return () => sub.remove();
  }, [years, openId, onClose]);

  const openPost = (p: TimelinePost) => {
    app.feed?.adopt(p);
    setOpenId(p.post_id);
  };

  if (openId) {
    const post = feedState.posts.find((p) => p.post_id === openId) ?? feedState.opened[openId]
      ?? state.posts.find((p) => p.post_id === openId);
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
        <FlatList
          data={post ? [post] : []}
          keyExtractor={(p) => p.post_id}
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              <Button label="Back to the photos by date" text="Back" variant="secondary" onPress={() => setOpenId(null)} />
            </View>
          }
          renderItem={({ item }) => <PostCard post={item} />}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
        />
      </SafeAreaView>
    );
  }

  const showYears = () => {
    setYears(true);
    void store.loadYears();
  };
  const openYear = (year: number) => {
    setYears(false);
    void store.open(startOfNextYear(year));
  };

  const header = (
    <View style={{ gap: 12 }}>
      <Txt variant="display" role="header">Photos by date</Txt>
      <Button label="Back to Photos" variant="secondary" onPress={onClose} />
      {years ? null : <Button label="Pick a year" onPress={showYears} />}
      {!years && state.startAt ? (
        <Button label="Show the newest photos first" text="Show the newest first" variant="secondary" onPress={() => void store.open(null)} />
      ) : null}
      {state.notice ? <Notice text={state.notice} onClose={() => store.clearNotice()} /> : null}
    </View>
  );

  if (years) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
        <FlatList
          data={state.years ?? []}
          keyExtractor={(y) => String(y.year)}
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              {header}
              <Txt variant="title" role="header">Which year?</Txt>
              <Button label="Go back to the photos" text="Go back" variant="secondary" onPress={() => setYears(false)} />
            </View>
          }
          renderItem={({ item }) => (
            <Button
              label={`See ${item.year}, ${photos(item.photo_count)}`}
              text={`${item.year} · ${photos(item.photo_count)}`}
              variant="secondary"
              onPress={() => openYear(item.year)}
            />
          )}
          ListEmptyComponent={state.years === null ? <Loading words="Loading the years…" /> : <Txt variant="muted">No photos yet.</Txt>}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        />
      </SafeAreaView>
    );
  }

  const rows = timelineRows(state.posts);
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList<TimelineRow>
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) =>
          item.type === 'month'
            ? <Txt variant="display" role="header" style={{ marginTop: 8 }}>{item.label}</Txt>
            : <TimelineCard post={item.post} onOpen={() => openPost(item.post)} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !state.loaded ? <Loading words="Loading the photos…" /> : <Txt variant="muted">No photos from before then.</Txt>
        }
        ListFooterComponent={
          state.hasMore ? (
            <Button label="Show older photos" variant="secondary" busy={state.status === 'loadingMore'} onPress={() => void store.loadMore()} />
          ) : undefined
        }
        onEndReached={() => void store.loadMore()}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        removeClippedSubviews={false}
      />
    </SafeAreaView>
  );
}

/** A post in the timeline: who sent it, when it was taken, its photos and caption. */
function TimelineCard({ post, onOpen }: { post: TimelinePost; onOpen: () => void }) {
  const [all, setAll] = useState(false);
  const ready = post.media.filter((m) => m.status === 'ready');
  const shown = all ? ready : ready.slice(0, SHOW_INLINE);
  const when = post.taken_at ? `Taken ${shortDate(post.taken_at)}, ${new Date(post.taken_at).getFullYear()}` : `Shared ${shortDate(post.published_at)}`;
  return (
    <Card testID={`timeline-${post.post_id}`} style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ padding: 16, gap: 4 }}>
        <Txt variant="strong">{post.author_name}</Txt>
        <Txt variant="muted">{when}</Txt>
      </View>
      {shown.map((m) => (
        <View
          key={m.media_id}
          style={{ width: '100%', aspectRatio: m.width && m.height ? Math.max(0.6, Math.min(1.8, m.width / m.height)) : 4 / 3, minHeight: MIN_TARGET }}
        >
          <MediaImage postId={post.post_id} mediaId={m.media_id} style={{ flex: 1 }} />
        </View>
      ))}
      <View style={{ padding: 16, gap: 12 }}>
        {ready.length > SHOW_INLINE && !all ? (
          <Button label={`Show all ${photos(ready.length)}`} variant="secondary" onPress={() => setAll(true)} />
        ) : null}
        {post.title ? <Txt variant="title" role="header">{post.title}</Txt> : null}
        {post.caption ? <Txt>{post.caption}</Txt> : null}
        <Button label={`Open ${post.author_name}'s post to love it or write back`} text="Open this post" variant="secondary" onPress={onOpen} />
      </View>
    </Card>
  );
}
