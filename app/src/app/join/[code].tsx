// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { JoinScreen } from '../../screens/JoinScreen';

export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <JoinScreen code={String(code ?? '')} />;
}
