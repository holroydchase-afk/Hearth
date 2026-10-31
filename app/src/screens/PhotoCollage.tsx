// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// MOMENT-2: a moment's photos as one collage, so the whole upload shows at once (like Facebook or FamilyAlbum).
// 1 photo alone in its own shape (between 4:5 tall and 1.91:1 wide), 2 side by side, 3 = one big and two,
// 4 or more = one big and three, the last saying "+5". Every photo fills its tile (no grey bars); tapping
// one opens the full-screen viewer there, where the whole photo shows with Back and Next (DS-4).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { FeedPost } from '../api/HearthApi';
import { useNav } from '../state/nav';
import { Txt } from '../ui/kit';
import { MIN_TARGET, useTheme } from '../ui/theme';
import { MediaImage } from './MediaImage';

type Media = FeedPost['media'][number];

/** How many photos go in the big tile, how many small ones, and how many more hide behind "+N". */
export function collageShape(n: number): { big: number; small: number; more: number } {
  if (n <= 1) return { big: n, small: 0, more: 0 };
  if (n === 2) return { big: 0, small: 2, more: 0 };
  if (n === 3) return { big: 1, small: 2, more: 0 };
  return { big: 1, small: 3, more: n - 4 };
}

/** One photo keeps its shape, clamped like Instagram: never taller than 4:5 or wider than 1.91:1. */
export const singleAspect = (m: Pick<Media, 'width' | 'height'> | undefined) =>
  m?.width && m?.height ? Math.max(0.8, Math.min(1.91, m.width / m.height)) : 4 / 3;

export function PhotoCollage({ postId, media }: { postId: string; media: Media[] }) {
  const nav = useNav();
  const { c } = useTheme();
  const n = media.length;
  const { big, small, more } = collageShape(n);

  const tile = (i: number, style: object) => {
    const extra = more && i === big + small - 1 ? more : 0;
    return (
      <Pressable
        key={media[i]!.media_id}
        accessibilityRole="button"
        accessibilityLabel={`Open photo ${i + 1} of ${n} full screen${extra ? `, and ${extra} more` : ''}`}
        onPress={() => nav.openViewer(postId, i)}
        style={[styles.tile, { backgroundColor: c.photo }, style]}
      >
        <MediaImage postId={postId} mediaId={media[i]!.media_id} fit="cover" style={{ flex: 1 }} />
        {extra ? (
          <View style={styles.more} pointerEvents="none">
            <Txt variant="display" style={{ color: '#FFFFFF' }}>{`+${extra}`}</Txt>
          </View>
        ) : null}
      </Pressable>
    );
  };

  if (!n) return null;
  return (
    <View testID={`collage-${postId}`} style={styles.gap}>
      {big ? tile(0, n === 1 ? { width: '100%', aspectRatio: singleAspect(media[0]) } : { width: '100%', aspectRatio: 1.6 }) : null}
      {small ? (
        <View style={[styles.row, styles.gap]}>
          {Array.from({ length: small }, (_, k) => tile(big + k, { flex: 1, aspectRatio: n === 2 ? 0.8 : 1 }))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 2 },
  row: { flexDirection: 'row' },
  tile: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, overflow: 'hidden' },
  more: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});
