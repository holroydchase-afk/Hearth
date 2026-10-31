// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// deno test --allow-env supabase/functions/sign-media/
// Smoke test of the handler against a mocked PostgREST (no network).
import { handler } from "./index.ts";

const env: Record<string, string> = {
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  B2_ENDPOINT: "https://s3.us-east-005.backblazeb2.com",
  B2_REGION: "us-east-005",
  B2_BUCKET: "hearth-media",
  B2_KEY_ID: "keyid",
  B2_APP_KEY: "appkey",
  MEDIA_KEK: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
};
for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);

const POST = "55555555-0000-0000-0000-0000000000a1";
const MEDIA = "66666666-0000-0000-0000-000000000001";
let canView = true;
let storedKey = "";
// FLAG-4: what the 0013 database answers when video_posting is off for the family (prepare_media_upload refuses)
let videoPostingOff = false;
const calls: string[] = [];

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  calls.push(`${init?.method ?? "GET"} ${url}`);
  const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
  if (url.endsWith("/rpc/can_view_post")) return ok(canView);
  if (url.endsWith("/rpc/prepare_media_upload")) {
    const items = JSON.parse(String(init?.body ?? "{}")).p_items ?? [];
    if (videoPostingOff && items.some((i: { kind?: string }) => i?.kind === "video")) {
      return new Response(JSON.stringify({ code: "42501", message: "video_posting_off", details: null, hint: null }), { status: 403 });
    }
    return ok([{ media_id: MEDIA, item_index: 0, kind: "photo", display_key: `s/x/p/${POST}/m/${MEDIA}/display`, thumb_key: `s/x/p/${POST}/m/${MEDIA}/thumb` }]);
  }
  if (url.includes("/media_keys") && init?.method === "POST") {
    storedKey = JSON.parse(String(init.body))[0].wrapped_dek;
    return new Response("", { status: 201 });
  }
  if (url.includes("/media_keys")) return ok([{ media_id: MEDIA, wrapped_dek: storedKey }]);
  if (url.includes("/media_items")) {
    return ok([{ id: MEDIA, post_id: POST, position: 0, kind: "photo", mime_type: "image/jpeg",
      display_key: `s/x/p/${POST}/m/${MEDIA}/display`, thumb_key: `s/x/p/${POST}/m/${MEDIA}/thumb`,
      width: 10, height: 10, duration_ms: null, byte_size: 100, thumb_byte_size: 10, enc_scheme: "aes-256-gcm-chunked-v1", upload_status: "ready" }]);
  }
  return new Response("not mocked", { status: 500 });
}) as typeof fetch;

function assert(c: unknown, msg: string) { if (!c) throw new Error(msg); }
const auth = { authorization: "Bearer user-jwt" };

Deno.test("upload then view round-trips the data key; URLs are 10-minute SigV4", async () => {
  const up = await handler(new Request("https://fn/sign-media", { method: "POST", headers: auth,
    body: JSON.stringify({ action: "upload", post_id: POST, items: [{ kind: "photo", mime_type: "image/jpeg",
      width: 10, height: 10, byte_size: 100, thumb_byte_size: 10, exif_stripped: true }] }) }));
  assert(up.status === 200, `upload status ${up.status}`);
  const u = await up.json();
  const put = new URL(u.items[0].display_put_url);
  assert(put.host === "s3.us-east-005.backblazeb2.com", "B2 host");
  assert(put.searchParams.get("X-Amz-Expires") === "600", "10 min TTL");
  assert(put.searchParams.get("X-Amz-SignedHeaders") === "content-type;host", "content-type signed on PUT");

  const view = await handler(new Request(`https://fn/sign-media?post_id=${POST}`, { headers: auth }));
  assert(view.status === 200, `view status ${view.status}`);
  const v = await view.json();
  assert(v.items[0].dek === u.items[0].dek, "unwrapped DEK equals issued DEK");
  assert(new URL(v.items[0].display_url).searchParams.get("X-Amz-Expires") === "600", "GET TTL");
});

Deno.test("view denied -> 404, no key lookups", async () => {
  canView = false; calls.length = 0;
  const r = await handler(new Request(`https://fn/sign-media?post_id=${POST}`, { headers: auth }));
  assert(r.status === 404, `status ${r.status}`);
  assert(!calls.some((c) => c.includes("media_keys")), "must not touch keys when denied");
  canView = true;
});

Deno.test("exif not stripped -> 422; no auth -> 401", async () => {
  const r = await handler(new Request("https://fn/sign-media", { method: "POST", headers: auth,
    body: JSON.stringify({ action: "upload", post_id: POST, items: [{ kind: "photo", exif_stripped: false }] }) }));
  assert(r.status === 422, `status ${r.status}`);
  const r2 = await handler(new Request(`https://fn/sign-media?post_id=${POST}`));
  assert(r2.status === 401, `status ${r2.status}`);
});

Deno.test("FLAG-4 video_posting off -> sign-media refuses a video upload (403 video_posting_off), signs nothing", async () => {
  videoPostingOff = true; calls.length = 0;
  const r = await handler(new Request("https://fn/sign-media", { method: "POST", headers: auth,
    body: JSON.stringify({ action: "upload", post_id: POST, items: [{ kind: "video", mime_type: "video/mp4",
      width: 1920, height: 1080, duration_ms: 5000, byte_size: 100000, thumb_byte_size: 1000, exif_stripped: true }] }) }));
  videoPostingOff = false;
  assert(r.status === 403, `status ${r.status}`);
  const body = await r.json();
  assert(body.error === "video_posting_off", `error ${body.error}`);
  assert(!JSON.stringify(body).includes("X-Amz-"), "no presigned URL in the refusal");
  assert(!calls.some((c) => c.startsWith("POST") && c.includes("media_keys")), "must not store a key for a refused upload");
});
