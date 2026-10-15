import { Redirect } from 'expo-router';
import React from 'react';
import { AppGate } from '../screens/AppGate';
import { useApp } from '../state/AppContext';

export default function Index() {
  const { status } = useApp();
  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  if (status === 'ready') return <Redirect href="/photos" />;
  return <AppGate />;
}
