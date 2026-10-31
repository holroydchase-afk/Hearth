// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// RR-15: the demo opens photos at /viewer?postId=…, a folder a static host can serve on reload
// (/viewer/<id> has no file behind it). Same screen as viewer/[postId].
import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ViewerScreen } from '../../screens/ViewerScreen';

export default function ViewerByQuery() {
  const { postId, i } = useLocalSearchParams<{ postId?: string; i?: string }>();
  if (!postId) return <Redirect href="/photos" />; // a host that drops the query lands on Photos, not an error
  return <ViewerScreen postId={String(postId)} index={Number(i ?? 0) || 0} />;
}
