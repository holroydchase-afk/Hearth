import React, { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, useFeed } from '../state/AppContext';
import { eventList, photosRows, type PhotosRow } from '../feed/events';
import { earlierGroups, isFromEarlier, monthSpan, startOfNextMonth, type EarlierGroup } from '../feed/timeline';
import { Button, Card, Loading, Notice, Txt } from '../ui/kit';
import { andList } from '../ui/format';
import { useTheme } from '../ui/theme';
import { AppGate } from './AppGate';
import { EventCard, EventsScreen, EventUpdate, type EventsView } from './EventsScreen';
import { PostCard } from './PostCard';
import { QueueStatus } from './QueueStatus';
import { TimelineScreen } from './TimelineScreen';
import { YourName } from './YourName';

/** BETA-TIME-1: "Older photos. Chase added 48 older photos from July 2024. See them" (opens the timeline at that month). */
function EarlierCard({ g, onOpen }: { g: EarlierGroup; onOpen: () => void }) {
  return (
    <Card testID={`earlier-card-${g.authorId}`}>
      <Txt variant="title" role="header">Older photos</Txt>
      <Txt>{`${g.authorName} added ${g.photoCount === 1 ? '1 older photo' : `${g.photoCount} older photos`} from ${monthSpan(g.fromAt, g.openAt)}.`}</Txt>
      <Button label={`See ${g.authorName}'s older photos by date`} text="See them" onPress={onOpen} />
    </Card>
  );
}

export function PhotosScreen() {
  const app = useApp();
  const state = useFeed();
  const { c } = useTheme();
  // BETA-TIME-2: the timeline opens in place; "Back to Photos" returns here.
  const [timeline, setTimeline] = useState<{ startAt: string | null } | null>(null);
  // EVT-3/4: the Events list or one event, opened in place; Back returns here.
  const [events, setEvents] = useState<EventsView | null>(null);
  if (app.status !== 'ready' || !app.space || !app.feed) return <AppGate />;
  const feed = app.feed;
  if (timeline) return <TimelineScreen startAt={timeline.startAt} onClose={() => setTimeline(null)} />;
  if (events) {
    return (
      <EventsScreen
        posts={state.posts}
        view={events}
        hasMore={state.hasMore}
        loadingMore={state.status === 'loadingMore'}
        onLoadMore={() => void feed.loadMore()}
        onOpen={(eventId) => setEvents({ eventId, fromList: true })}
        onClose={() => setEvents(null)}
      />
    );
  }
  const senders = andList(state.posts.map((p) => p.author_name));
  // BETA-TIME-1: old photos added today don't take over the top; they go in a card.
  const earlier = earlierGroups(state.posts);
  const recent = state.posts.filter((p) => !isFromEarlier(p));
  // EVT-2/3: an event's first post is a bigger card; its later posts are one update line (see EVENT_LATER_POSTS_IN_PHOTOS).
  const rows = photosRows(recent);
  const hasEvents = eventList(state.posts).length > 0;
  const openEvent = (eventId: string) => setEvents({ eventId, fromList: false });
  const renderRow = ({ item }: { item: PhotosRow }) =>
    item.type === 'post' ? <PostCard post={item.post} />
      : item.type === 'event' ? <EventCard eventId={item.eventId} eventName={item.eventName} post={item.post} onOpen={() => openEvent(item.eventId)} />
        : <EventUpdate eventId={item.eventId} eventName={item.eventName} photoCount={item.photoCount} onOpen={() => openEvent(item.eventId)} />;

  const header = (
    <View style={{ gap: 12 }}>
      <Txt variant="display" role="header">{`Photos of ${app.space.name}`}</Txt>
      {senders ? <Txt variant="muted">{`Sent by ${senders}`}</Txt> : null}
      {hasEvents ? (
        <Button label="See events" variant="secondary" onPress={() => setEvents({ eventId: null, fromList: true })} />
      ) : null}
      {app.space.can_post ? <YourName /> : null}
      <QueueStatus />
      {state.notice ? <Notice text={state.notice} onClose={() => feed.clearNotice()} /> : null}
      {state.loaded ? (
        <Button label="Check for new photos" variant="secondary" busy={state.status === 'refreshing'} onPress={() => void feed.refresh()} />
      ) : null}
      {state.loaded && state.posts.length ? (
        <Button label="Show photos by the date they were taken" text="Show by date" variant="secondary" onPress={() => setTimeline({ startAt: null })} />
      ) : null}
      {earlier.map((g) => (
        <EarlierCard key={g.authorId} g={g} onOpen={() => setTimeline({ startAt: startOfNextMonth(g.openAt) })} />
      ))}
    </View>
  );

  const empty = state.loaded && earlier.length ? null : !state.loaded ? (
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
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
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
