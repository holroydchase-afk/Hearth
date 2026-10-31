// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// deno test supabase/functions/sign-media/sigv4_test.ts
// Uses the presigned-URL example in the AWS S3 docs ("Authenticating Requests: Using Query Parameters").
import { presign, uriEncode } from "./sigv4.ts";

function assertEquals(a: unknown, b: unknown) {
  if (a !== b) throw new Error(`expected\n  ${b}\ngot\n  ${a}`);
}

Deno.test("matches AWS documented presigned GET example", async () => {
  const url = await presign({
    method: "GET",
    url: "https://examplebucket.s3.amazonaws.com/test.txt",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    expiresSeconds: 86400,
    now: new Date("2013-05-24T00:00:00Z"),
  });
  const sig = new URL(url).searchParams.get("X-Amz-Signature");
  assertEquals(sig, "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
});

Deno.test("uriEncode keeps unreserved, encodes others", () => {
  assertEquals(uriEncode("a b/c~d", true), "a%20b/c~d");
  assertEquals(uriEncode("a/b"), "a%2Fb");
});
