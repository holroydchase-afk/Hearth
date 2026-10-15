import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { JoinScreen } from '../../screens/JoinScreen';

export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <JoinScreen code={String(code ?? '')} />;
}
