// Session, family space, prefs and the long-lived stores (feed, upload queue, media cache).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { HearthApi, Session, Space } from '../api/HearthApi';
import { FeedStore, type FeedState } from '../feed/store';
import { MediaCache } from '../media/cache';
import { clearArrivals, recordArrival } from '../notify/latency';
import { listenForArrivals, registerForPush } from '../notify/push';
import type { KV } from '../platform/kv';
import type { PickedAsset } from '../share/bulk';
import { BigTextContext } from '../ui/theme';
import { UploadQueue, type Job, type Prepared, type QueueItem } from '../upload/queue';
import { defaultPrefs, loadPrefs, savePrefs, serverPrefs, type Prefs } from './prefs';

export interface AppDeps {
  api: HearthApi;
  kv: KV;
  /** Phone number behind "Call Chase" (EXPO_PUBLIC_HELP_PHONE). */
  helpPhone?: string | null;
  prepare: (item: QueueItem) => Promise<Prepared>;
  pickPhotos: () => Promise<{ items: QueueItem[] } | { denied: true }>;
  /** BETA-BULK-1: up to 100 photos with EXIF, read on the phone only (media/pick.ts pickBulk). */
  pickBulk?: () => Promise<{ assets: PickedAsset[] } | { denied: true }>;
  saveToPhone: (bytes: Uint8Array, name: string) => Promise<'saved' | 'denied'>;
  openUrl: (url: string) => Promise<unknown>;
}

export type AppStatus = 'loading' | 'signedOut' | 'noSpace' | 'ready';

export interface AppValue {
  status: AppStatus;
  deps: AppDeps;
  session: Session | null;
  space: Space | null;
  /** Name of the person to call for help: who invited me, or me if I own the space. */
  helper: string | null;
  feed: FeedStore | null;
  queue: UploadQueue | null;
  media: MediaCache | null;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  /** Re-read session + spaces (after sign-in or joining). */
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider missing');
  return v;
}

const EMPTY_FEED: FeedState = { posts: [], status: 'loading', loaded: false, hasMore: false, notice: null, comments: {}, drafts: {} };

export function useFeed(): FeedState {
  const { feed } = useApp();
  return useSyncExternalStore(
    feed ? feed.subscribe : noopSubscribe,
    feed ? feed.getState : () => EMPTY_FEED,
    feed ? feed.getState : () => EMPTY_FEED,
  );
}

const noopSubscribe = () => () => {};
const NO_JOBS: Job[] = [];

export function useJobs(): Job[] {
  const { queue } = useApp();
  const cache = useRef<{ q: UploadQueue | null; v: Job[] }>({ q: null, v: NO_JOBS });
  const get = useCallback(() => {
    if (!queue) return NO_JOBS;
    if (cache.current.q !== queue) cache.current = { q: queue, v: queue.jobs() };
    return cache.current.v;
  }, [queue]);
  const sub = useCallback((fn: () => void) => {
    if (!queue) return () => {};
    return queue.subscribe(() => { cache.current = { q: queue, v: queue.jobs() }; fn(); });
  }, [queue]);
  return useSyncExternalStore(sub, get, get);
}

interface Loaded {
  status: AppStatus;
  session: Session | null;
  space: Space | null;
  feed: FeedStore | null;
  queue: UploadQueue | null;
  media: MediaCache | null;
  prefs: Prefs;
}

const SIGNED_OUT: Loaded = { status: 'signedOut', session: null, space: null, feed: null, queue: null, media: null, prefs: defaultPrefs('owner') };

export function AppProvider({ deps, children }: { deps: AppDeps; children: ReactNode }) {
  const [s, setS] = useState<Loaded>({ ...SIGNED_OUT, status: 'loading' });
  const live = useRef<Loaded>(s);
  const unlisten = useRef<(() => void) | null>(null);
  live.current = s;

  const load = useCallback(async () => {
    live.current.queue?.stop();
    const session = await deps.api.getSession().catch(() => null);
    if (!session) {
      setS(SIGNED_OUT);
      return;
    }
    let spaces: Space[] = [];
    try {
      spaces = await deps.api.mySpaces();
    } catch {
      spaces = [];
    }
    const space = spaces[0] ?? null;
    if (!space) {
      setS({ ...SIGNED_OUT, status: 'noSpace', session });
      return;
    }
    const prefs = await loadPrefs(deps.kv, session.userId, space.role);
    const feed = new FeedStore({ api: deps.api, kv: deps.kv, userId: session.userId, spaceId: space.space_id, inviter: space.inviter_name });
    const media = new MediaCache(deps.api);
    let queue: UploadQueue | null = null;
    if (space.can_post) {
      queue = await UploadQueue.open({
        api: deps.api, kv: deps.kv, userId: session.userId, prepare: deps.prepare,
        onPublished: (job) => { void feed.refresh().then(() => queue?.remove(job.id)); },
      });
    }
    setS({ status: 'ready', session, space, feed, queue, media, prefs });
    await feed.hydrate();
    void feed.refresh();
    // AE-10: note when each notice reaches this phone (kept on the phone only).
    unlisten.current?.();
    unlisten.current = listenForArrivals((postId, at) => { void recordArrival(deps.kv, session.userId, postId, at); });
    // AE-2: tell the server where to send notices. Failures are silent; the next launch retries.
    void registerForPush().then((token) => {
      if (token) return deps.api.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web');
    }).catch(() => {});
  }, [deps]);

  useEffect(() => {
    void load();
  }, [load]);

  // Unmount (sign-out, tests): no timers or retries may outlive the provider.
  useEffect(() => () => { live.current.queue?.stop(); unlisten.current?.(); }, []);

  // Back in front: retry waiting uploads and fetch new photos (BETA-SHARE-4).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      live.current.queue?.kick();
      void live.current.feed?.refresh();
    });
    return () => sub.remove();
  }, []);

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setS((cur) => {
      const prefs = { ...cur.prefs, ...p };
      if (cur.session) void savePrefs(deps.kv, cur.session.userId, prefs);
      if (cur.space && p.notify && p.notify !== cur.prefs.notify) {
        deps.api.setNotificationPrefs(cur.space.space_id, serverPrefs(p.notify)).catch(() => {});
      }
      return { ...cur, prefs };
    });
  }, [deps.kv, deps.api]);

  const signOut = useCallback(async () => {
    live.current.queue?.stop();
    unlisten.current?.();
    unlisten.current = null;
    const who = live.current.session?.userId;
    if (who) await clearArrivals(deps.kv, who);
    await deps.api.signOut().catch(() => {});
    setS(SIGNED_OUT);
  }, [deps.api, deps.kv]);

  const value = useMemo<AppValue>(() => ({
    ...s,
    deps,
    helper: s.space ? (s.space.role === 'owner' ? null : s.space.inviter_name) : null,
    setPrefs,
    reload: load,
    signOut,
  }), [s, deps, setPrefs, load, signOut]);

  return (
    <Ctx.Provider value={value}>
      <BigTextContext.Provider value={s.prefs.bigText}>{children}</BigTextContext.Provider>
    </Ctx.Provider>
  );
}
