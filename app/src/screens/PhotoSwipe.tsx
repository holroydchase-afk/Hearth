// SWIPE-1..5: a post's photos, one at a time at the card's full width. A swipe moves through
// them, and so do labeled "◀ Back" / "Next ▶" buttons (no gesture-only actions), with "2 of 7"
// words a screen reader hears. Plain FlatList paging: no native dependency (Expo Go, web).
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Dimensions, FlatList, Pressable, View,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import type { FeedPost } from '../api/HearthApi';
import { useNav } from '../state/nav';
import { Button, Txt } from '../ui/kit';
import { MIN_TARGET, useTheme } from '../ui/theme';
import { MediaImage } from './MediaImage';

type Media = FeedPost['media'][number];

/** Which photo each card was on, so coming back from the viewer keeps it there (SWIPE-3). Memory only. */
const lastPos = new Map<string, number>();

/** Today's clamp for a photo's shape: never wider than 1.8:1 or taller than 0.6:1. */
export const cardAspect = (m: Pick<Media, 'width' | 'height'> | undefined) =>
  m?.width && m?.height ? Math.max(0.6, Math.min(1.8, m.width / m.height)) : 4 / 3;

export function PhotoSwipe({ postId, media }: { postId: string; media: Media[] }) {
  const nav = useNav();
  const { c } = useTheme();
  const n = media.length;
  // Card width before layout: the screen less the list's 16 pt padding each side.
  const [width, setWidth] = useState(() => Math.max(MIN_TARGET, Dimensions.get('window').width - 32));
  const [pos, setPosState] = useState(() => Math.min(lastPos.get(postId) ?? 0, n - 1));
  const list = useRef<FlatList<Media>>(null);
  const first = useRef(true);
  // SWIPE-5: one height for the whole post, from the first photo; others are letterboxed.
  const height = width / cardAspect(media[0]);

  const setPos = (i: number) => {
    const to = Math.max(0, Math.min(n - 1, i));
    lastPos.set(postId, to);
    setPosState(to);
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    AccessibilityInfo.announceForAccessibility(`Photo ${pos + 1} of ${n}`);
  }, [pos, n]);

  const scrollTo = (i: number, animated: boolean) => {
    try { list.current?.scrollToOffset({ offset: i * width, animated }); } catch { /* not laid out yet */ }
  };

  const go = (i: number) => {
    setPos(i);
    scrollTo(i, true);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== width) setWidth(w);
  };
  // After a width change, stay on the same photo.
  useEffect(() => { scrollTo(pos, false); }, [width]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const w = e.nativeEvent.layoutMeasurement?.width || width;
    if (w <= 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / w);
    if (i !== pos) setPos(i);
  };

  return (
    <View testID={`photos-${postId}`} onLayout={onLayout}>
      <FlatList
        ref={list}
        testID={`photo-pager-${postId}`}
        data={media}
        keyExtractor={(m) => m.media_id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ width, height }}
        extraData={`${pos}:${width}`}
        getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
        initialScrollIndex={pos > 0 ? pos : undefined}
        onScroll={onScroll}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={32}
        renderItem={({ item, index }) => (
          <View testID={`photo-page-${index}`} style={{ width, height, backgroundColor: c.photo }}>
            {/* Lazy: only the shown photo and its neighbours ask for signed URLs. */}
            {Math.abs(index - pos) <= 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open photo ${index + 1} of ${n} full screen`}
                onPress={() => { setPos(index); nav.openViewer(postId, index); }}
                style={{ flex: 1, minHeight: MIN_TARGET, minWidth: MIN_TARGET }}
              >
                <MediaImage postId={postId} mediaId={item.media_id} fit="contain" style={{ flex: 1 }} />
              </Pressable>
            ) : null}
          </View>
        )}
      />
      <View style={{ paddingHorizontal: 14, paddingTop: 12, gap: 8 }}>
        <View accessible accessibilityLabel={`Photo ${pos + 1} of ${n}`} accessibilityLiveRegion="polite" style={{ alignItems: 'center' }}>
          <Txt variant="strong">{`${pos + 1} of ${n}`}</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {pos > 0
            ? <Button label="Previous photo" text="◀ Back" variant="secondary" style={{ flex: 1 }} onPress={() => go(pos - 1)} />
            : <View style={{ flex: 1 }} />}
          {pos < n - 1
            ? <Button label="Next photo" text="Next ▶" variant="secondary" style={{ flex: 1 }} onPress={() => go(pos + 1)} />
            : <View style={{ flex: 1 }} />}
        </View>
      </View>
    </View>
  );
}
