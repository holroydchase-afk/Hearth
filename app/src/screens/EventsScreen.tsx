// SPEC-GROUPS v2, EVT-2..4: the event card and update line shown in Photos, and the Events section
// (opened in place from a "See events" button at the top of Photos, like the timeline; not a tab).
// EVT-6..9: inside an event, one timeline of everyone's photos by when they were taken (feed/eventTimeline.ts).
import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FeedPost } from '../api/HearthApi';
import { eventCountWords, eventList, eventPosts, updateWords } from '../feed/events';
import { eventContributors, eventTimeline, type EventPhoto, type EventTimelineRow } from '../feed/eventTimeline';
import { Button, Card, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { PhotoSwipe } from './PhotoSwipe';
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
    return <EventTimeline posts={eventPosts(posts, view.eventId)} fromList={view.fromList} more={more} onOpen={onOpen} onClose={onClose} />;
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
        ListFooterComponent={more ?? undefined}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        removeClippedSubviews={false}
      />
    </SafeAreaView>
  );
}

/** EVT-7: one moment: "3:10 pm · 14 photos from Danielle, Rachel and Susan", a swipe through its photos, and under
 *  each photo who it is from (and its post's caption). */
function Moment({ row, swipeId, posts }: { row: Extract<EventTimelineRow, { type: 'moment' }>; swipeId: string; posts: FeedPost[] }) {
  const byMedia = new Map<string, EventPhoto>(row.photos.map((p) => [p.media.media_id, p]));
  return (
    <Card testID={`moment-${swipeId}`} style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ padding: 14 }}>
        <Txt variant="strong">{row.line}</Txt>
      </View>
      <PhotoSwipe
        id={swipeId}
        items={row.photos}
        below={(it) => {
          const photo = byMedia.get(it.media.media_id);
          const caption = posts.find((p) => p.post_id === it.postId)?.caption;
          return (
            <View style={{ gap: 4, alignItems: 'center' }}>
              {photo ? <Txt variant="muted">{`From ${photo.from}`}</Txt> : null}
              {caption ? <Txt>{caption}</Txt> : null}
            </View>
          );
        }}
      />
      <View style={{ height: 14 }} />
    </Card>
  );
}

/** EVT-6..9: inside one event. Oldest first by when taken, a header per day, moments, name buttons, "Added later". */
function EventTimeline({ posts, fromList, more, onOpen, onClose }: {
  posts: FeedPost[];
  fromList: boolean;
  more: React.ReactNode;
  onOpen: (eventId: string | null) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const [person, setPerson] = useState<string | null>(null);
  const name = posts[0]?.event_name ?? '';
  const people = eventContributors(posts);
  const who = people.some((p) => p.authorId === person) ? person : null;
  const rows = eventTimeline(posts, { person: who });
  const swipeId = (key: string) => `${who ?? 'everyone'}-${key}`;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => `${who ?? 'everyone'}-${r.key}`}
        renderItem={({ item }) =>
          item.type === 'moment'
            ? <Moment row={item} swipeId={swipeId(item.key)} posts={posts} />
            : <Txt variant="title" role="header">{item.label}</Txt>}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Txt variant="display" role="header">{name}</Txt>
            {fromList
              ? <Button label="Back to events" variant="secondary" onPress={() => onOpen(null)} />
              : <Button label="Back to Photos" variant="secondary" onPress={onClose} />}
            {/* EVT-8: buttons, not gestures. */}
            {people.length > 1 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button label="Show everyone's photos" text="Everyone" variant="secondary" selected={who === null} onPress={() => setPerson(null)} />
                {people.map((p) => (
                  <Button key={p.authorId} label={`Show photos from ${p.name}`} text={p.name} variant="secondary" selected={who === p.authorId} onPress={() => setPerson(p.authorId)} />
                ))}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={<Txt variant="muted">No photos here yet.</Txt>}
        ListFooterComponent={(more as React.ReactElement | null) ?? undefined}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        removeClippedSubviews={false}
      />
    </SafeAreaView>
  );
}
