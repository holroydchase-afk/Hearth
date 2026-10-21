// Builds the app's dependencies. EXPO_PUBLIC_HEARTH_FAKE=1 → in-memory FakeApi (web smoke test,
// demos); otherwise SupabaseApi against EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.
import { createClient } from '@supabase/supabase-js';
import { Linking, Platform } from 'react-native';
import { FakeBackend, type FakeState } from '../api/fake/FakeBackend';
import { SupabaseApi } from '../api/SupabaseApi';
import { pickBulk, pickPhotos } from '../media/pick';
import { prepareItem } from '../media/prepare';
import { fileMediaStore, mediaKeyStore } from '../platform/mediaStore';
import { saveToPhone } from '../platform/saveToPhone';
import { secureSessionStorage } from '../platform/secureSession';
import { asyncStorageKV } from '../platform/storage';
import type { AppDeps } from './AppContext';

export const FAKE_MODE = process.env.EXPO_PUBLIC_HEARTH_FAKE === '1';
const FAKE_KEY = 'hearth.fakeBackend.v1';

function fakeBackend(): FakeBackend {
  const ls = Platform.OS === 'web' ? globalThis.localStorage : undefined;
  const persist = ls ? (s: FakeState) => { try { ls.setItem(FAKE_KEY, JSON.stringify(s)); } catch { /* full */ } } : undefined;
  const saved = ls?.getItem(FAKE_KEY);
  if (saved) {
    try { return new FakeBackend(JSON.parse(saved) as FakeState, persist); } catch { /* reseed */ }
  }
  const be = FakeBackend.withFixture({ joIsMember: false }, persist);
  be.changed();
  return be;
}

export function createRuntime(): AppDeps | { error: string } {
  const common = {
    kv: asyncStorageKV,
    prepare: prepareItem,
    pickPhotos: (opts: { videos: boolean }) => pickPhotos(10, opts),
    pickBulk: () => pickBulk(),
    saveToPhone,
    openUrl: (u: string) => Linking.openURL(u),
    // A3: kept photo files on phones only; the web build keeps none.
    mediaDisk: fileMediaStore && mediaKeyStore ? { store: fileMediaStore, keys: mediaKeyStore } : null,
  };
  if (FAKE_MODE) {
    const be = fakeBackend();
    if (Platform.OS === 'web') (globalThis as { __hearthFake?: FakeBackend }).__hearthFake = be;
    return { ...common, api: be.clientFor(null, { trackAppSession: true }), helpPhone: '+1 304 555 0100' };
  }
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { error: 'Hearth is not set up yet (missing server address).' };
  const client = createClient(url, anonKey, {
    auth: { storage: secureSessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return { ...common, api: new SupabaseApi({ url, anonKey, client }), helpPhone: process.env.EXPO_PUBLIC_HELP_PHONE ?? null };
}
