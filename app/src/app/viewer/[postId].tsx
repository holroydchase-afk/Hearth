// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ViewerScreen } from '../../screens/ViewerScreen';

export default function Viewer() {
  const { postId, i } = useLocalSearchParams<{ postId: string; i?: string }>();
  return <ViewerScreen postId={String(postId)} index={Number(i ?? 0) || 0} />;
}
