// Runs the same contract against a real PostgREST (+ optional sign-media), e.g. the backend's
// integration harness (backend/tests/integration/start.sh) or a `supabase start` stack.
//
//   HEARTH_API_URL     PostgREST root (http://127.0.0.1:3001) or a Supabase base URL (…/rest/v1 is added
//                      by supabase-js; set HEARTH_REST_ROOT=0 for that case)
//   HEARTH_ANON_KEY    anon key
//   HEARTH_USERS_JSON  {"<name>": {"id": "<uuid>", "jwt": "<access token>"}, ...}
//   HEARTH_CAST        optional {"poster": "<name>", "viewerIn": ..., "viewerOut": ..., "joiner": ..., "ratelimit": ...}
//                      default matches backend/supabase/seed.sql (alex / grandma_rivera / grandma_chen / blair)
//   HEARTH_SERVICE_KEY optional service_role JWT: lets tests mark media ready without B2
//   HEARTH_SPACE_ID, HEARTH_CIRCLE_IN, HEARTH_CIRCLE_OUT  default to the seed's space A / Dad's side / Everyone
//   HEARTH_JOINER_EMAIL email of the joiner user
//   HEARTH_MEDIA=1     also run the sign-media tests (needs the edge function + B2)
import { createClient } from '@supabase/supabase-js';
import { SupabaseApi } from '../SupabaseApi';
import type { ContractHarness, ContractUser } from './harness';

export const supabaseEnvReady = (): boolean =>
  !!(process.env.HEARTH_API_URL && process.env.HEARTH_ANON_KEY && process.env.HEARTH_USERS_JSON);

/** What this environment can exercise, known before the tests are defined (so skips are honest). */
export function supabaseCaps(): { joiner: boolean; ratelimit: boolean; media: boolean } {
  const users = JSON.parse(process.env.HEARTH_USERS_JSON ?? '{}') as Record<string, unknown>;
  const cast: Record<string, string> = process.env.HEARTH_CAST ? JSON.parse(process.env.HEARTH_CAST) : (SEED_CAST as Record<string, string>);
  const has = (u: string) => !!users[u] || (!!cast[u] && !!users[cast[u]!]);
  return { joiner: has('joiner') && !!process.env.HEARTH_JOINER_EMAIL, ratelimit: has('ratelimit'), media: process.env.HEARTH_MEDIA === '1' };
}

const SEED_CAST: Partial<Record<ContractUser, string>> = {
  poster: 'alex', viewerIn: 'grandma_rivera', viewerOut: 'grandma_chen', ratelimit: 'blair',
};

/** REAL-1: Node's network fetch, kept by jest.environment.js before jest-expo swaps in Expo's native-only one. */
export const netFetch: typeof fetch = (globalThis as { __hearthNodeFetch?: typeof fetch }).__hearthNodeFetch ?? fetch;

export async function supabaseHarness(): Promise<ContractHarness> {
  const url = process.env.HEARTH_API_URL!.replace(/\/$/, '');
  const anonKey = process.env.HEARTH_ANON_KEY!;
  const users = JSON.parse(process.env.HEARTH_USERS_JSON!) as Record<string, { id: string; jwt: string }>;
  const cast: Partial<Record<ContractUser, string>> = process.env.HEARTH_CAST ? JSON.parse(process.env.HEARTH_CAST) : SEED_CAST;
  const restRoot = process.env.HEARTH_REST_ROOT !== '0';
  const userFor = (u: ContractUser) => (users[u] ? users[u] : cast[u] ? users[cast[u]!] : undefined);
  // A bare PostgREST serves /rpc/x, not /rest/v1/rpc/x: strip the gateway prefix supabase-js adds.
  const rewrite: typeof fetch = (input, init) => netFetch(restRoot ? String(input).replace(`${url}/rest/v1/`, `${url}/`) : input, init);
  const make = (jwt: string | null, userId: string | null = null) => {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: rewrite, ...(jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : {}) },
    });
    const api = new SupabaseApi({ url, anonKey, client, accessToken: async () => jwt });
    // REAL-1: a JWT-only client has no Auth session to read; say who it is, as a signed-in app would.
    if (userId) api.getSession = async () => ({ userId, email: '' });
    return api;
  };
  const rpcRaw = async (jwt: string, fn: string, args: unknown) => {
    const r = await rewrite(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST', body: JSON.stringify(args),
      headers: { apikey: anonKey, authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
    });
    const body = await r.text();
    if (!r.ok) throw new Error(`${fn}: HTTP ${r.status} ${body}`);
    return body ? JSON.parse(body) : null;
  };
  return {
    name: 'SupabaseApi',
    spaceId: process.env.HEARTH_SPACE_ID ?? '22222222-0000-0000-0000-00000000000a',
    circleIn: process.env.HEARTH_CIRCLE_IN ?? '33333333-0000-0000-0000-0000000000a1',
    circleOut: process.env.HEARTH_CIRCLE_OUT ?? '33333333-0000-0000-0000-0000000000a0',
    joinerEmail: process.env.HEARTH_JOINER_EMAIL,
    has: (u) => !!userFor(u),
    as: (u) => {
      const x = userFor(u);
      if (!x) throw new Error(`HEARTH_USERS_JSON has no "${u}"`);
      return make(x.jwt, x.id);
    },
    anon: () => make(null),
    supportsMedia: process.env.HEARTH_MEDIA === '1',
    attachReadyMedia: async (_api, postId) => {
      // Without B2: create the media row as the poster (same SQL sign-media calls), then mark it
      // ready with the service role, exactly as sign-media's finalize does after its HEAD check.
      const service = process.env.HEARTH_SERVICE_KEY;
      const poster = userFor('poster');
      if (!service || !poster) throw new Error('HEARTH_SERVICE_KEY is needed to publish posts without B2');
      const rows = await rpcRaw(poster.jwt, 'prepare_media_upload', {
        p_post: postId,
        p_items: [{ kind: 'photo', mime_type: 'image/jpeg', width: 4, height: 3, duration_ms: null, byte_size: 92, thumb_byte_size: 44, exif_stripped: true }],
      });
      for (const r of rows as { media_id: string }[]) {
        // sign-media saves the wrapped key at upload; ready needs it (S15, migration 0012)
        const k = await rewrite(`${url}/rest/v1/media_keys`, {
          method: 'POST', body: JSON.stringify({ media_id: r.media_id, wrapped_dek: '\\x00' }),
          headers: { apikey: anonKey, authorization: `Bearer ${service}`, 'content-type': 'application/json', prefer: 'return=minimal' },
        });
        if (!k.ok) throw new Error(`media_keys: HTTP ${k.status}`);
        await rpcRaw(service, 'mark_media_upload_result', { p_media: r.media_id, p_ok: true });
      }
    },
  };
}
