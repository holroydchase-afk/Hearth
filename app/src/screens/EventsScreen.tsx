// SPEC-GROUPS v2, EVT-2..4: the event card and update line shown in Photos, and the Events section
// (opened in place from a "See events" button at the top of Photos, like the timeline; not a tab).
import React from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FeedPost } from '../api/HearthApi';
import { eventCountWords, eventList, eventPosts, updateWords } from '../feed/events';
import { Button, Card, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { PostCard } from './PostCard';

/** EVT-2: the first post of an event, bigger, under the event's name. */
export function EventCard({ eventId, eventName, post, onOpen }: { eventId: string; eventName: string; post: FeedPost; onOpen: () => void }) {
  const { c } = useTheme();
  return (
    <View testID={`event-card-${eventId}`} style={{ gap: 12, padding: 12, borderRadius: 20, borderWidth: 3, borderColor: c.accent, backgroundColor: c.accentSoft }}>
      <Txt variant="display" role="header">{eventName}</Txt>
      <PostCard post={post} />
      <Button label={`Open ${eventName}`} onPress={onOpen} />
    </View>
  );
}

/** EVT-3: later posts to an event, as one line that opens it. */
export function EventUpdate({ eventId, eventName, photoCount, onOpen }: { eventId: string; eventName: string; photoCount: number; onOpen: () => void }) {
  return (
    <Card testID={`event-update-${eventId}`}>
      <Txt variant="strong">{updateWords(photoCount, eventName)}</Txt>
      <Button label={`Open ${eventName} to see the new photos`} text="See the new photos" variant="secondary" onPress={onOpen} />
    </Card>
  );
}

export interface EventsView {
  /** The open event, or null for the list. */
  eventId: string | null;
  /** Opened from the Events list (Back goes to the list) or straight from Photos (Back goes to Photos). */
  fromList: boolean;
}

/** EVT-4: the events list, or one event's posts. */
export function EventsScreen({ posts, view, hasMore, loadingMore, onLoadMore, onOpen, onClose }: {
  posts: FeedPost[];
  view: EventsView;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (eventId: string | null) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const more = hasMore ? <Button label="Show older photos" variant="secondary" busy={loadingMore} onPress={onLoadMore} /> : null;

  if (view.eventId) {
    const mine = eventPosts(posts, view.eventId);
    const name = mine[0]?.event_name ?? '';
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
        <FlatList
          data={mine}
          keyExtractor={(p) => p.post_id}
          renderItem={({ item }) => <PostCard post={item} />}
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              <Txt variant="display" role="header">{name}</Txt>
              {view.fromList
                ? <Button label="Back to events" variant="secondary" onPress={() => onOpen(null)} />
                : <Button label="Back to Photos" variant="secondary" onPress={onClose} />}
            </View>
          }
          ListFooterComponent={more}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
        />
      </SafeAreaView>
    );
  }

  const list = eventList(posts);
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={list}
        keyExtractor={(e) => e.eventId}
        renderItem={({ item }) => (
          <Card testID={`event-${item.eventId}`}>
            <Txt variant="title" role="header">{item.eventName}</Txt>
            <Txt variant="muted">{eventCountWords(item)}</Txt>
            <Button label={`Open ${item.eventName}`} onPress={() => onOpen(item.eventId)} />
          </Card>
        )}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Txt variant="display" role="header">Events</Txt>
            <Button label="Back to Photos" variant="secondary" onPress={onClose} />
          </View>
        }
        ListEmptyComponent={<Txt variant="muted">No events yet.</Txt>}
        ListFooterComponent={more}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        removeClippedSubviews={false}
      />
    </SafeAreaView>
  );
}
