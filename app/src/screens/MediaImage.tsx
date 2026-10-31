// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useApp } from '../state/AppContext';
import { Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';

/** Thumbnail first (a small blurry preview), then the full photo. Words while loading. */
export function MediaImage({ postId, mediaId, style, fit = 'cover', full = true }: {
  postId: string; mediaId: string; style?: StyleProp<ViewStyle>; fit?: 'cover' | 'contain'; full?: boolean;
}) {
  const { media } = useApp();
  const { c } = useTheme();
  const [thumb, setThumb] = useState<string | null>(null);
  const [display, setDisplay] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setThumb(null);
    setDisplay(null);
    setFailed(false);
    if (!media) return;
    media.uri(postId, mediaId, 'thumb').then((u) => alive && setThumb(u)).catch(() => {});
    if (full) media.uri(postId, mediaId, 'display').then((u) => alive && setDisplay(u)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [media, postId, mediaId, full]);

  const uri = display ?? thumb;
  return (
    <View style={[styles.box, { backgroundColor: c.photo }, style]}>
      {uri ? (
        <Image source={{ uri }} resizeMode={fit} blurRadius={display ? 0 : 6} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.center}>
          {failed ? <Txt variant="muted">This photo can't be shown right now.</Txt> : <><ActivityIndicator color={c.accent} /><Txt variant="muted">Loading the photo…</Txt></>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
});
