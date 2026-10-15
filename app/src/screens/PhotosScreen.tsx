import React from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, useFeed } from '../state/AppContext';
import { Button, Loading, Notice, Txt } from '../ui/kit';
import { andList } from '../ui/format';
import { useTheme } from '../ui/theme';
import { AppGate } from './AppGate';
import { PostCard } from './PostCard';
import { QueueStatus } from './QueueStatus';

export function PhotosScreen() {
  const app = useApp();
  const state = useFeed();
  const { c } = useTheme();
  if (app.status !== 'ready' || !app.space || !app.feed) return <AppGate />;
  const feed = app.feed;
  const senders = andList(state.posts.map((p) => p.author_name));

  const header = (
    <View style={{ gap: 12 }}>
      <Txt variant="display" role="header">{`Photos of ${app.space.name}`}</Txt>
      {senders ? <Txt variant="muted">{`Sent by ${senders}`}</Txt> : null}
      <QueueStatus />
      {state.notice ? <Notice text={state.notice} onClose={() => feed.clearNotice()} /> : null}
      {state.loaded ? (
        <Button label="Check for new photos" variant="secondary" busy={state.status === 'refreshing'} onPress={() => void feed.refresh()} />
      ) : null}
    </View>
  );

  const empty = !state.loaded ? (
    <Loading words="Loading the photos…" />
  ) : (
    <Txt variant="muted">
      {app.space.can_post
        ? 'Nothing shared yet. Tap Share to send your first photos.'
        : `No photos yet. When ${app.helper ?? 'your family'} shares photos, they'll show up here.`}
    </Txt>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={state.posts}
        keyExtractor={(p) => p.post_id}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          state.hasMore ? (
            <Button label="Show older photos" variant="secondary" busy={state.status === 'loadingMore'} onPress={() => void feed.loadMore()} />
          ) : null
        }
        onEndReached={() => void feed.loadMore()}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={state.status === 'refreshing'} onRefresh={() => void feed.refresh()} />}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
      />
    </SafeAreaView>
  );
}
