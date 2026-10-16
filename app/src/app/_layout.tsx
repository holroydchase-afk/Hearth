import { Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { YoungSerif_400Regular } from '@expo-google-fonts/young-serif';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNotificationTaps } from '../notify/push';
import { AppProvider } from '../state/AppContext';
import { NavContext, type Nav } from '../state/nav';
import { createRuntime } from '../state/runtime';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Screen, Txt } from '../ui/kit';

const runtime = createRuntime();

const nav: Nav = {
  openViewer: (postId, i) => router.push({ pathname: '/viewer/[postId]', params: { postId, i: String(i) } }),
  close: () => (router.canGoBack() ? router.back() : router.replace('/photos')),
  goPhotos: () => router.replace('/photos'),
  goSignIn: () => router.replace('/sign-in'),
  goJoin: (code) => router.push({ pathname: '/join/[code]', params: { code } }),
};

export default function RootLayout() {
  useFonts({ YoungSerif_400Regular, Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold });
  useNotificationTaps(useMemo(() => (postId: string) => nav.openViewer(postId, 0), []));
  if ('error' in runtime) {
    return <SafeAreaProvider><Screen><Txt variant="title">{runtime.error}</Txt></Screen></SafeAreaProvider>;
  }
  return (
    <SafeAreaProvider>
      <ErrorBoundary onReport={(r) => runtime.api.reportClientError(r)}>
        <AppProvider deps={runtime}>
          <NavContext.Provider value={nav}>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </NavContext.Provider>
        </AppProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
