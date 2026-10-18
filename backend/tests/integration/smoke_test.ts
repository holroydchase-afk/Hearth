// Real-API smoke test: supabase-js-style HTTP calls (apikey + Bearer JWT) against PostgREST,
// so RLS, grants and error codes are the real ones.
//
//   tests/integration/start.sh >/dev/null            # local harness (PostgREST on :3001)
//   deno test --allow-read --allow-net --allow-env tests/integration/
//
// Reads the harness JSON from $HARNESS_JSON (default tests/integration/.state/harness.json):
//   {url, anonKey, serviceRoleKey, users: {name: {id, jwt}}}. In CI the same JSON is built
//   from `supabase status`, with url = <API_URL>/rest/v1.
// Dependency-free on purpose (like the sign-media tests): no registry needed to run.
function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
}

type Harness = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  users: Record<string, { id: string; jwt: string }>;
};
const path = Deno.env.get("HARNESS_JSON") ??
  new URL("./.state/harness.json", import.meta.url).pathname;
const H: Harness = JSON.parse(await Deno.readTextFile(path));

const SPACE_A = "22222222-0000-0000-0000-00000000000a";
const CIRCLE_DAD_GP = "33333333-0000-0000-0000-0000000000a1"; // Grandma + Grandpa Rivera
const POST_EVERYONE = "55555555-0000-0000-0000-0000000000a3";
const POST_DAD_GP = "55555555-0000-0000-0000-0000000000a1";

type Res = { status: number; body: any };
async function call(token: string, path: string, init: RequestInit = {}, extra: Record<string, string> = {}): Promise<Res> {
  const res = await fetch(`${H.url}/${path}`, {
    ...init,
    headers: {
      apikey: H.anonKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
      ...extra,
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const as = (name: string) => H.users[name].jwt;
const rpc = (token: string, fn: string, args: unknown, extra?: Record<string, string>) =>
  call(token, `rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }, extra);
const ok = (r: Res, what: string) => {
  assert(r.status >= 200 && r.status < 300, `${what}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const feedIds = async (who: string) =>
  (ok(await rpc(as(who), "get_feed", { p_space: SPACE_A, p_limit: 50 }), `get_feed as ${who}`) as { post_id: string }[])
    .map((p) => p.post_id);

Deno.test("harness JSON has the documented shape", () => {
  assert(H.url.startsWith("http"));
  assert(H.anonKey.split(".").length === 3);
  for (const name of ["alex", "blair", "grandma_rivera", "grandpa_rivera", "grandma_chen", "aunt_jo"]) {
    assert(H.users[name]?.id && H.users[name]?.jwt, `missing user ${name}`);
  }
});

Deno.test("BETA-AUD-3 get_feed over HTTP: each user sees only posts shared with their circles", async () => {
  assertEquals(await feedIds("grandma_chen"), [POST_EVERYONE]); // Mom's side, only in "Everyone"
  assertEquals((await feedIds("grandma_rivera")).sort(), [POST_DAD_GP, POST_EVERYONE].sort());
  const alex = ok(await rpc(as("alex"), "get_feed", { p_space: SPACE_A }), "author feed") as any[];
  assertEquals(alex.length, 3);
  assert(alex.every((p) => Array.isArray(p.audience) && typeof p.reach_count === "number"), "author gets audience");
  const gma = ok(await rpc(as("grandma_rivera"), "get_feed", { p_space: SPACE_A }), "viewer feed") as any[];
  assert(gma.every((p) => p.audience === null && p.seen_count === null), "viewers never get audience/seen counts");
  // anon gets nothing
  const anon = await rpc(H.anonKey, "get_feed", { p_space: SPACE_A });
  assertEquals(anon.body.code, "42501");
});

Deno.test("create -> publish -> heart -> comment -> delete, as two users, with visibility proven over HTTP", async (t) => {
  const clientId = crypto.randomUUID();
  let postId = "";

  await t.step("create_post is idempotent on p_client_id", async () => {
    const args = { p_client_id: clientId, p_space: SPACE_A, p_caption: "Pumpkin patch", p_circle_ids: [CIRCLE_DAD_GP] };
    postId = ok(await rpc(as("alex"), "create_post", args), "create_post");
    const again = ok(await rpc(as("alex"), "create_post", { ...args, p_caption: "retry" }), "create_post retry");
    assertEquals(again, postId);
    const none = await rpc(as("alex"), "create_post", { ...args, p_client_id: crypto.randomUUID(), p_circle_ids: [] });
    assertEquals(none.body.code, "23514");
    const viewer = await rpc(as("grandma_rivera"), "create_post", { ...args, p_client_id: crypto.randomUUID() });
    assertEquals(viewer.body.code, "42501");
  });

  await t.step("upload + publish (idempotent)", async () => {
    const items = [{ kind: "photo", mime_type: "image/jpeg", width: 2048, height: 1536, byte_size: 1000, thumb_byte_size: 100, exif_stripped: true }];
    const prepared = ok(await rpc(as("alex"), "prepare_media_upload", { p_post: postId, p_items: items }), "prepare") as any[];
    // what sign-media does with the service role: save the wrapped key at upload (S15: ready needs it),
    // then mark the item ready after HEAD-checking the blob
    ok(await call(H.serviceRoleKey, "media_keys", { method: "POST", body: JSON.stringify({ media_id: prepared[0].media_id, wrapped_dek: "\\x00" }) },
                  { prefer: "return=minimal" }), "save wrapped key");
    ok(await rpc(H.serviceRoleKey, "mark_media_upload_result", { p_media: prepared[0].media_id, p_ok: true }), "mark ready");
    ok(await rpc(as("alex"), "publish_post", { p_post: postId }), "publish");
    ok(await rpc(as("alex"), "publish_post", { p_post: postId }), "publish again is a no-op");
  });

  await t.step("BETA-AUD-3 audience member sees it; a user only in another circle sees nothing on any path", async () => {
    assert((await feedIds("grandma_rivera")).includes(postId), "grandma_rivera (in the circle) sees it");
    assert(!(await feedIds("grandma_chen")).includes(postId), "grandma_chen (not in the circle) does not");
    const chen = as("grandma_chen");
    assertEquals((await call(chen, `posts?id=eq.${postId}&select=id`)).body, []);
    assertEquals((await call(chen, `media_items?post_id=eq.${postId}&select=id`)).body, []);
    assertEquals((await rpc(chen, "can_view_post", { p_post: postId })).body, false); // what sign-media asks
    for (const [fn, args] of [
      ["toggle_heart", { p_post: postId }],
      ["add_comment", { p_client_id: crypto.randomUUID(), p_post: postId, p_body: "hi" }],
      ["get_comments", { p_post: postId }],
      ["mark_seen", { p_post: postId }],
      ["delete_post", { p_post: postId }],
    ] as const) {
      const r = await rpc(chen, fn, args);
      assertEquals(r.body?.code, "P0002", `${fn} must look like "not found" (got ${JSON.stringify(r.body)})`);
    }
  });

  await t.step("BETA-REPLY-1 toggle_heart", async () => {
    assertEquals(ok(await rpc(as("grandma_rivera"), "toggle_heart", { p_post: postId }), "heart"), { i_hearted: true, heart_count: 1 });
    // AUD-8: the author (a parent) reads who hearted; another viewer does not.
    const who = ok(await call(as("alex"), `reactions?post_id=eq.${postId}&select=user_id`), "author sees who hearted") as any[];
    assertEquals(who.map((r) => r.user_id), [H.users.grandma_rivera.id]);
    assertEquals(ok(await call(as("grandpa_rivera"), `reactions?post_id=eq.${postId}&select=user_id`), "viewer sees none"), []);
    assertEquals(ok(await rpc(as("grandma_rivera"), "toggle_heart", { p_post: postId }), "unheart"), { i_hearted: false, heart_count: 0 });
  });

  await t.step("BETA-REPLY-2 add_comment (idempotent) and get_comments", async () => {
    const cid = crypto.randomUUID();
    const c1 = ok(await rpc(as("grandpa_rivera"), "add_comment", { p_client_id: cid, p_post: postId, p_body: "  So big now!  " }), "comment");
    const c2 = ok(await rpc(as("grandpa_rivera"), "add_comment", { p_client_id: cid, p_post: postId, p_body: "So big now!" }), "retry");
    assertEquals(c2, c1);
    assertEquals((await rpc(as("grandpa_rivera"), "add_comment", { p_client_id: crypto.randomUUID(), p_post: postId, p_body: "   " })).body.code, "23514");
    const list = ok(await rpc(as("alex"), "get_comments", { p_post: postId }), "get_comments") as any[];
    assertEquals(list.map((c) => [c.author_name, c.body]), [["Grandpa Rivera", "So big now!"]]);
  });

  await t.step("BETA-AUD-5 delete_post: author only, gone everywhere, idempotent", async () => {
    assertEquals((await rpc(as("grandma_rivera"), "delete_post", { p_post: postId })).body.code, "42501");
    ok(await rpc(as("alex"), "delete_post", { p_post: postId }), "delete");
    ok(await rpc(as("alex"), "delete_post", { p_post: postId }), "delete again is a no-op");
    assert(!(await feedIds("alex")).includes(postId));
    assert(!(await feedIds("grandma_rivera")).includes(postId));
    assertEquals((await rpc(as("grandma_rivera"), "toggle_heart", { p_post: postId })).body.code, "P0002");
  });
});

Deno.test("BETA-JOIN-4 (S10) rate limit survives failed requests on the real PostgREST", async () => {
  const ip = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`; // unique per run
  const hdr = { "x-forwarded-for": ip };
  for (let i = 1; i <= 10; i++) {
    const r = await rpc(H.anonKey, "invite_preview", { p_code: "WRONGCODE" + i }, hdr);
    assertEquals([r.status, r.body.code], [400, "22023"], `attempt ${i}`);
  }
  const blocked = await rpc(H.anonKey, "invite_preview", { p_code: "WRONGCODE11" }, hdr);
  assertEquals([blocked.status, blocked.body.code], [429, "54000"]);
});
