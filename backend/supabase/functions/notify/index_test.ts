// deno test --allow-env supabase/functions/notify/
// The sender against a mocked PostgREST, Expo Push and Resend (no network).
import { buildEmail, buildPush, handler, joinNames, type Batch } from "./index.ts";

const env: Record<string, string> = {
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  RESEND_API_KEY: "re_test",
  RESEND_FROM: "Hearth <hello@hearth.family>",
  APP_LINK_BASE: "https://hearth.family",
};
for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);

const P1 = "55555555-0000-0000-0000-0000000000a1";
const P2 = "55555555-0000-0000-0000-0000000000a2";
const pushBatch = (over: Partial<Batch> = {}): Batch => ({
  recipient_id: "a0000000-0000-0000-0000-0000000000a1", channel: "push", actor_first_names: ["Alex"],
  post_ids: [P1], latest_post_id: P1, post_count: 1, comment_count: 0, heart_count: 0,
  outbox_ids: ["o1"], push_tokens: ["ExponentPushToken[gma]"], email: null, ...over,
});
const emailBatch = (over: Partial<Batch> = {}): Batch => pushBatch({
  recipient_id: "a0000000-0000-0000-0000-0000000000a2", channel: "email", push_tokens: [],
  email: "grandpa@example.com", outbox_ids: ["o2"], ...over,
});

function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }
function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}\n  got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`);
}

// ---------- wording (grandparent UX: plain words, first names only) ----------
Deno.test("names: 1, 2, 3 and 4+ people read naturally", () => {
  eq(joinNames(["Alex"]), "Alex", "one");
  eq(joinNames(["Alex", "Blair"]), "Alex and Blair", "two");
  eq(joinNames(["Alex", "Blair", "Jo"]), "Alex, Blair and Jo", "three");
  eq(joinNames(["A", "B", "C", "D"]), "A, B and 2 others", "four");
});

Deno.test("BETA-NOTIFY-2: push says who and opens the post; no image, caption or child's name", () => {
  const [m] = buildPush(pushBatch());
  eq(m.to, ["ExponentPushToken[gma]"], "only this member's tokens");
  eq(m.body, "Alex shared new photos. Tap to see them.", "body");
  eq(m.data, { post_id: P1 }, "data is the post id only");
  const keys = Object.keys(m).sort();
  eq(keys, ["body", "data", "sound", "title", "to"], "no image/attachment fields at all");
  assert(!JSON.stringify(m).includes("http"), "no URL in a push");
});

Deno.test("BETA-NOTIFY-4: 3 posts in one batch are 1 push that opens the newest", () => {
  const ms = buildPush(pushBatch({ post_ids: [P1, P2], latest_post_id: P2, post_count: 3 }));
  eq(ms.length, 1, "one message");
  eq(ms[0].data, { post_id: P2 }, "newest post");
});

Deno.test("BETA-REPLY-3: replies read as replies", () => {
  const [m] = buildPush(pushBatch({ actor_first_names: ["Grandma", "Grandpa"], post_count: 0, comment_count: 1, heart_count: 1 }));
  eq(m.body, "Grandma and Grandpa replied to your photos. Tap to see.", "reply body");
});

Deno.test("BETA-NOTIFY-5: email links to the post and carries no photo or caption", () => {
  const e = buildEmail(emailBatch());
  eq(e.to, ["grandpa@example.com"], "to");
  eq(e.subject, "Alex shared new photos on Hearth", "subject");
  assert(e.text.includes(`https://hearth.family/p/${P1}`), "link to the post");
  assert(!/<img/i.test(e.html), "no image in the email");
  assert(e.html.includes(`https://hearth.family/p/${P1}`), "html has the link");
});

Deno.test("email: names are HTML-escaped", () => {
  const e = buildEmail(emailBatch({ actor_first_names: ["<b>Al"] }));
  assert(!e.html.includes("<b>Al"), "escaped");
});

// ---------- handler: one run of the cron ----------
type Call = { url: string; body: unknown; auth: string | null };
function mockFetch(opts: { batches: Batch[]; expo?: (body: unknown) => Response; resend?: () => Response }) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body, auth: new Headers(init?.headers).get("authorization") });
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.endsWith("/rpc/claim_notification_batches")) return ok(opts.batches);
    if (url.endsWith("/rpc/release_notifications") || url.endsWith("/rpc/forget_push_tokens")) return ok(null);
    if (url === "https://exp.host/--/api/v2/push/send") {
      return opts.expo ? opts.expo(body) : ok({ data: (body as unknown[]).map(() => ({ status: "ok", id: "t" })) });
    }
    if (url === "https://api.resend.com/emails/batch") return opts.resend ? opts.resend() : ok({ data: [{ id: "e" }] });
    throw new Error("unexpected fetch " + url);
  }) as typeof fetch;
  return calls;
}
const run = (auth = "Bearer service") =>
  handler(new Request("https://fn/notify", { method: "POST", headers: { authorization: auth } }));

Deno.test("security: only the service role (cron) may run the sender", async () => {
  const calls = mockFetch({ batches: [pushBatch()] });
  const res = await run("Bearer some-user-jwt");
  eq(res.status, 401, "status");
  eq(calls.length, 0, "nothing claimed");
});

Deno.test("run: claims, sends 1 push and 1 email, reports counts only", async () => {
  const calls = mockFetch({ batches: [pushBatch(), emailBatch()] });
  const res = await run();
  eq(res.status, 200, "status");
  eq(await res.json(), { push: 1, email: 1, failed: 0 }, "summary has counts only");
  const expo = calls.find((c) => c.url.includes("exp.host"))!;
  eq((expo.body as unknown[]).length, 1, "one push message");
  const resend = calls.find((c) => c.url.includes("resend"))!;
  eq(resend.auth, "Bearer re_test", "Resend key used");
  eq(calls.filter((c) => c.url.includes("release")).length, 0, "nothing released");
});

Deno.test("run: a failed Expo call puts those notices back for the next run", async () => {
  const calls = mockFetch({ batches: [pushBatch()], expo: () => new Response("down", { status: 503 }) });
  const res = await run();
  eq(await res.json(), { push: 0, email: 0, failed: 1 }, "counted as failed");
  const rel = calls.find((c) => c.url.endsWith("/rpc/release_notifications"))!;
  eq(rel.body, { p_ids: ["o1"] }, "released the claimed ids");
});

Deno.test("run: a failed Resend call puts the email back", async () => {
  const calls = mockFetch({ batches: [emailBatch()], resend: () => new Response("no", { status: 500 }) });
  await run();
  const rel = calls.find((c) => c.url.endsWith("/rpc/release_notifications"))!;
  eq(rel.body, { p_ids: ["o2"] }, "released");
});

Deno.test("run: DeviceNotRegistered tokens are forgotten", async () => {
  const calls = mockFetch({
    batches: [pushBatch()],
    expo: () => new Response(JSON.stringify({ data: [{ status: "error", details: { error: "DeviceNotRegistered", expoPushToken: "ExponentPushToken[gma]" } }] }), { status: 200 }),
  });
  await run();
  const f = calls.find((c) => c.url.endsWith("/rpc/forget_push_tokens"))!;
  eq(f.body, { p_tokens: ["ExponentPushToken[gma]"] }, "forgot the dead token");
});

Deno.test("privacy: the sender never logs tokens, emails or URLs", async () => {
  const logged: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); };
  try {
    mockFetch({ batches: [pushBatch(), emailBatch()], expo: () => new Response("down", { status: 503 }) });
    await run();
  } finally { Object.assign(console, orig); }
  const all = logged.join("\n");
  assert(!all.includes("ExponentPushToken"), "no token in logs");
  assert(!all.includes("@example.com"), "no email in logs");
  assert(!all.includes("http"), "no URL in logs");
});
