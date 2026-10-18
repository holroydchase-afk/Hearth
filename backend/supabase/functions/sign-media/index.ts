// sign-media: the ONLY way to get bytes in or out of the B2 bucket.
//
//   GET  /sign-media?post_id=<uuid>
//        -> 10-minute presigned GET URLs (display + thumb) and the per-item data
//           key, but only if can_view_post(post_id) is true for the caller.
//   POST /sign-media  {"action":"upload","post_id":..., "items":[{kind,mime_type,width,height,
//                      duration_ms?,byte_size,thumb_byte_size,exif_stripped:true}, ...]}
//        -> creates pending media rows (RLS + free-tier video cap enforced in SQL),
//           mints a fresh AES-256 data key per item, and returns presigned PUT URLs.
//   POST /sign-media  {"action":"finalize","media_ids":[...]}
//        -> HEADs each uploaded object, checks size, marks rows ready/failed.
//
// Encryption: clients encrypt with the returned per-item key (AES-256-GCM,
// chunked) before PUT, so B2 only ever stores ciphertext. Keys are stored
// wrapped (AES-KW) under MEDIA_KEK, which lives only in Edge Function secrets.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//      B2_ENDPOINT (https://s3.us-east-005.backblazeb2.com), B2_REGION (us-east-005),
//      B2_BUCKET, B2_KEY_ID, B2_APP_KEY, MEDIA_KEK (base64, 32 bytes), ALLOWED_ORIGINS (csv)

import { presign } from "./sigv4.ts";

const TTL_SECONDS = 600; // 10 minutes
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

// ---------- tiny PostgREST client (keeps the function dependency-free) ----------
type Auth = { kind: "user"; jwt: string } | { kind: "service" };

class DbError extends Error {
  constructor(public status: number, public code: string | undefined, message: string) {
    super(message);
  }
}

async function rest<T>(auth: Auth, path: string, init: RequestInit = {}): Promise<T> {
  const key = auth.kind === "service" ? env("SUPABASE_SERVICE_ROLE_KEY") : env("SUPABASE_ANON_KEY");
  const bearer = auth.kind === "service" ? env("SUPABASE_SERVICE_ROLE_KEY") : auth.jwt;
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new DbError(res.status, body?.code, body?.message ?? res.statusText);
  return body as T;
}

const rpc = <T>(auth: Auth, fn: string, args: unknown) =>
  rest<T>(auth, `rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

// ---------- key wrapping ----------
const b64 = {
  enc: (u: Uint8Array) => btoa(String.fromCharCode(...u)),
  dec: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};
const hexToBytes = (h: string) => Uint8Array.from(h.replace(/^\\x/, "").match(/../g)!.map((x) => parseInt(x, 16)));
const bytesToPgHex = (u: Uint8Array) => "\\x" + Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");

let kekPromise: Promise<CryptoKey> | null = null;
function kek(): Promise<CryptoKey> {
  kekPromise ??= crypto.subtle.importKey("raw", b64.dec(env("MEDIA_KEK")), "AES-KW", false, ["wrapKey", "unwrapKey"]);
  return kekPromise;
}

async function newWrappedDek(): Promise<{ raw: Uint8Array; wrapped: Uint8Array }> {
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dek));
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", dek, await kek(), "AES-KW"));
  return { raw, wrapped };
}

async function unwrapDek(wrapped: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.unwrapKey("raw", wrapped as BufferSource, await kek(), "AES-KW",
    { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  return new Uint8Array(await crypto.subtle.exportKey("raw", k));
}

// ---------- B2 ----------
function objectUrl(key: string): string {
  return `${env("B2_ENDPOINT").replace(/\/$/, "")}/${env("B2_BUCKET")}/${key}`;
}

function sign(method: "GET" | "PUT" | "HEAD", key: string, extra: Partial<Parameters<typeof presign>[0]> = {}) {
  return presign({
    method,
    url: objectUrl(key),
    accessKeyId: env("B2_KEY_ID"),
    secretAccessKey: env("B2_APP_KEY"),
    region: env("B2_REGION"),
    expiresSeconds: TTL_SECONDS,
    ...extra,
  });
}

// ---------- HTTP helpers ----------
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    ...(allowed.includes(origin) ? { "access-control-allow-origin": origin, vary: "origin" } : {}),
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...cors(req) },
  });
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

// ---------- handlers ----------
interface MediaRow {
  id: string;
  post_id: string;
  position: number;
  kind: "photo" | "video";
  mime_type: string;
  display_key: string;
  thumb_key: string;
  width: number;
  height: number;
  duration_ms: number | null;
  byte_size: number;
  thumb_byte_size: number;
  enc_scheme: string;
  upload_status: string;
}

async function handleView(req: Request, user: Auth, postId: string): Promise<Response> {
  // 1. Permission check as the caller (auth.uid() = JWT sub).
  const allowed = await rpc<boolean>(user, "can_view_post", { p_post: postId });
  if (allowed !== true) return json(req, 404, { error: "not_found" }); // don't leak existence

  // 2. Media rows, read under the caller's RLS for defense in depth.
  const media = await rest<MediaRow[]>(user,
    `media_items?post_id=eq.${postId}&upload_status=eq.ready&order=position.asc` +
      `&select=id,post_id,position,kind,mime_type,display_key,thumb_key,width,height,duration_ms,byte_size,thumb_byte_size,enc_scheme,upload_status`);
  if (media.length === 0) return json(req, 200, { post_id: postId, expires_in: TTL_SECONDS, items: [] });

  // 3. Wrapped keys come from a service-role-only table.
  const keys = await rest<{ media_id: string; wrapped_dek: string }[]>({ kind: "service" },
    `media_keys?media_id=in.(${media.map((m) => m.id).join(",")})&select=media_id,wrapped_dek`);
  const keyById = new Map(keys.map((k) => [k.media_id, k.wrapped_dek]));

  const items = await Promise.all(media.map(async (m) => {
    const wrapped = keyById.get(m.id);
    if (!wrapped) throw new Error(`missing key for media ${m.id}`);
    return {
      id: m.id,
      position: m.position,
      kind: m.kind,
      mime_type: m.mime_type,
      width: m.width,
      height: m.height,
      duration_ms: m.duration_ms,
      byte_size: m.byte_size,
      enc_scheme: m.enc_scheme,
      dek: b64.enc(await unwrapDek(hexToBytes(wrapped))),
      display_url: await sign("GET", m.display_key),
      thumb_url: await sign("GET", m.thumb_key),
    };
  }));
  return json(req, 200, { post_id: postId, expires_in: TTL_SECONDS, items });
}

interface UploadItem {
  kind: "photo" | "video";
  mime_type: string;
  width: number;
  height: number;
  duration_ms?: number | null;
  byte_size: number;
  thumb_byte_size: number;
  exif_stripped: boolean;
}

async function handleUpload(req: Request, user: Auth, postId: string, items: UploadItem[]): Promise<Response> {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    return json(req, 400, { error: "items must be an array of 1..20" });
  }
  // Server-side flag: refuse anything that wasn't stripped. (The DB CHECK enforces it too.)
  if (items.some((i) => i?.exif_stripped !== true)) {
    return json(req, 422, { error: "exif_not_stripped", message: "Strip EXIF/GPS metadata before uploading." });
  }

  // One SQL call creates the rows. That call does the permission checks
  // (author + can_post_in_space) and the free-tier video cap (trigger, row lock on space).
  let prepared: { media_id: string; item_index: number; kind: string; display_key: string; thumb_key: string }[];
  try {
    prepared = await rpc(user, "prepare_media_upload", { p_post: postId, p_items: items });
  } catch (e) {
    if (e instanceof DbError) {
      if (e.message.includes("free_video_cap_reached")) {
        return json(req, 402, { error: "free_video_cap_reached", message: "Free spaces can upload 10 videos per month." });
      }
      if (e.code === "42501") return json(req, 403, { error: "forbidden" });
      if (["23514", "22023", "22P02", "23502"].includes(e.code ?? "")) return json(req, 400, { error: "invalid", message: e.message });
    }
    throw e;
  }

  const out = [];
  const keyRows = [];
  for (const p of prepared) {
    const { raw, wrapped } = await newWrappedDek();
    keyRows.push({ media_id: p.media_id, wrapped_dek: bytesToPgHex(wrapped), kek_version: 1 });
    // Sign content-type so the PUT can only store opaque ciphertext.
    const hdr = { "content-type": "application/octet-stream" };
    out.push({
      media_id: p.media_id,
      item_index: p.item_index,
      dek: b64.enc(raw),
      enc_scheme: "aes-256-gcm-chunked-v1",
      display_put_url: await sign("PUT", p.display_key, { signedHeaders: hdr }),
      thumb_put_url: await sign("PUT", p.thumb_key, { signedHeaders: hdr }),
      required_headers: hdr,
    });
  }
  await rest({ kind: "service" }, "media_keys", { method: "POST", body: JSON.stringify(keyRows), headers: { prefer: "return=minimal" } });
  return json(req, 200, { post_id: postId, expires_in: TTL_SECONDS, items: out });
}

async function handleFinalize(req: Request, user: Auth, mediaIds: string[]): Promise<Response> {
  if (!Array.isArray(mediaIds) || mediaIds.length < 1 || mediaIds.length > 20 || !mediaIds.every((id) => UUID_RE.test(id))) {
    return json(req, 400, { error: "media_ids must be 1..20 uuids" });
  }
  // RLS: an uploader can see their own pending rows.
  const rows = await rest<(MediaRow & { uploader_id: string })[]>(user,
    `media_items?id=in.(${mediaIds.join(",")})&upload_status=eq.pending&select=id,display_key,thumb_key,byte_size,thumb_byte_size,uploader_id`);
  const results = await Promise.all(rows.map(async (m) => {
    const [d, t] = await Promise.all([
      fetch(await sign("HEAD", m.display_key), { method: "HEAD" }),
      fetch(await sign("HEAD", m.thumb_key), { method: "HEAD" }),
    ]);
    const ok = d.ok && t.ok &&
      Number(d.headers.get("content-length")) === Number(m.byte_size) &&
      Number(t.headers.get("content-length")) === Number(m.thumb_byte_size);
    await rpc({ kind: "service" }, "mark_media_upload_result", { p_media: m.id, p_ok: ok });
    return { media_id: m.id, ok };
  }));
  return json(req, 200, { results });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  const jwt = bearer(req);
  if (!jwt) return json(req, 401, { error: "unauthorized" });
  const user: Auth = { kind: "user", jwt };

  try {
    if (req.method === "GET") {
      const postId = new URL(req.url).searchParams.get("post_id") ?? "";
      if (!UUID_RE.test(postId)) return json(req, 400, { error: "post_id required" });
      return await handleView(req, user, postId);
    }
    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (body?.action === "upload") {
        if (!UUID_RE.test(body.post_id ?? "")) return json(req, 400, { error: "post_id required" });
        return await handleUpload(req, user, body.post_id, body.items);
      }
      if (body?.action === "finalize") return await handleFinalize(req, user, body.media_ids);
      return json(req, 400, { error: "unknown action" });
    }
    return json(req, 405, { error: "method_not_allowed" });
  } catch (e) {
    if (e instanceof DbError && (e.status === 401 || e.code === "PGRST301")) return json(req, 401, { error: "unauthorized" });
    // Name and code only: database and storage messages can carry row values or object paths (PRIV-2).
    console.error(`sign-media error (${e instanceof DbError ? `DbError ${e.status} ${e.code ?? ""}` : e instanceof Error ? e.name : "unknown"})`);
    return json(req, 500, { error: "internal" });
  }
}

if (import.meta.main) Deno.serve(handler);
