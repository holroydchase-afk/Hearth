// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Minimal AWS Signature V4 query-string presigner (S3-compatible: Backblaze B2, R2).
// Web Crypto only — no SDK. Verified against the AWS documented example in sigv4_test.ts.

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(data)));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

/** RFC 3986 encoding as S3 expects. Slashes are kept in paths, encoded elsewhere. */
export function uriEncode(s: string, keepSlash = false): string {
  let out = "";
  for (const ch of s) {
    if (/[A-Za-z0-9\-._~]/.test(ch) || (keepSlash && ch === "/")) out += ch;
    else for (const b of enc.encode(ch)) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

function amzDate(d: Date): { amz: string; short: string } {
  const iso = d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // YYYYMMDDTHHMMSSZ
  return { amz: iso, short: iso.slice(0, 8) };
}

export interface PresignOptions {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  /** Full object URL without a query string, e.g. https://s3.us-east-005.backblazeb2.com/bucket/key */
  url: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  expiresSeconds: number;
  now?: Date;
  /** Extra query params to sign, e.g. response-content-type. */
  query?: Record<string, string>;
  /** Headers the client MUST send verbatim (e.g. content-type on PUT). host is always signed. */
  signedHeaders?: Record<string, string>;
  service?: string;
}

export async function presign(o: PresignOptions): Promise<string> {
  const u = new URL(o.url);
  const service = o.service ?? "s3";
  const { amz, short } = amzDate(o.now ?? new Date());
  const scope = `${short}/${o.region}/${service}/aws4_request`;

  const headers: Record<string, string> = { host: u.host };
  for (const [k, v] of Object.entries(o.signedHeaders ?? {})) headers[k.toLowerCase()] = v.trim();
  const headerNames = Object.keys(headers).sort();
  const signedHeaders = headerNames.join(";");

  const q: Record<string, string> = {
    ...(o.query ?? {}),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${o.accessKeyId}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(o.expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(q)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(q[k])}`)
    .join("&");

  // u.pathname is already percent-encoded by URL; decode then re-encode S3-style.
  const canonicalPath = uriEncode(decodeURIComponent(u.pathname), true);
  const canonicalHeaders = headerNames.map((h) => `${h}:${headers[h]}\n`).join("");

  const canonicalRequest = [
    o.method,
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, await sha256Hex(canonicalRequest)].join("\n");

  let key: ArrayBuffer = await hmac(enc.encode("AWS4" + o.secretAccessKey), short);
  key = await hmac(key, o.region);
  key = await hmac(key, service);
  key = await hmac(key, "aws4_request");
  const signature = toHex(await hmac(key, stringToSign));

  return `${u.origin}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
