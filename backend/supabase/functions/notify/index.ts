// notify: sends queued notices (migration 0003). Run every minute by pg_cron/pg_net
// (or Supabase Scheduled Functions) with the service role key as the bearer.
//
//   POST /functions/v1/notify   Authorization: Bearer <service role key | NOTIFY_CRON_SECRET>
//   -> 200 {push, email, failed}   (counts only)
//
// One run: claim_notification_batches() -> Expo Push (push batches) and Resend (email
// batches) -> release_notifications() for anything that failed, forget_push_tokens()
// for phones Expo says are gone. Batching windows live in SQL.
//
// PRIVACY: messages carry the actor's chosen name ("Grandma June"), counts and a post id only; a bulk
// import also names the month and year taken ("from Jul 2024"), from posts that person can see
// (privacy-security, Oct 17: coarse, no day, place or child). No photo, caption,
// comment text or child's name, and nothing about them in the logs: never log tokens,
// email addresses, URLs or message text.

export type Batch = {
  recipient_id: string;
  channel: "push" | "email";
  actor_names: string[];
  post_ids: string[];
  latest_post_id: string;
  post_count: number;
  comment_count: number;
  heart_count: number;
  outbox_ids: string[];
  push_tokens: string[];
  email: string | null;
  // 0010 (BETA-BULK-6): a bulk import's batch notice. Optional so an older claim still parses.
  is_batch?: boolean;
  photo_count?: number;
  taken_from?: string | null;
  taken_to?: string | null;
};

export type PushMessage = { to: string[]; title: string; body: string; sound: "default"; data: { post_id: string } };
export type Email = { from: string; to: string[]; subject: string; text: string; html: string };

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const RESEND_URL = "https://api.resend.com/emails/batch";
const CHUNK = 100; // Expo and Resend both take up to 100 per call

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

// ---------- wording ----------
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "Someone";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

// "Jul 2024" in Eastern time (the POC family is all in WV/NC, like the email windows).
const month = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", year: "numeric" })
    .formatToParts(new Date(iso));
  return { m: parts.find((p) => p.type === "month")!.value, y: parts.find((p) => p.type === "year")!.value };
};

/** BETA-BULK-6: "from Jul 2024", "from Jun to Jul 2024", "from Dec 2023 to Jan 2024", or "" with no dates. */
export function takenSpan(from?: string | null, to?: string | null): string {
  if (!from || !to) return "";
  const a = month(from), b = month(to);
  if (a.y === b.y && a.m === b.m) return ` from ${a.m} ${a.y}`;
  if (a.y === b.y) return ` from ${a.m} to ${b.m} ${b.y}`;
  return ` from ${a.m} ${a.y} to ${b.m} ${b.y}`;
}

function summary(b: Batch): { line: string; isReply: boolean; one?: boolean } {
  const who = joinNames(b.actor_names);
  if (b.is_batch && b.post_count > 0 && b.comment_count + b.heart_count === 0) {
    const n = b.photo_count ?? 0;
    const photos = n === 1 ? "1 photo" : `${n} photos`;
    return { line: `${who} added ${photos}${takenSpan(b.taken_from, b.taken_to)}`, isReply: false, one: n === 1 };
  }
  if (b.post_count > 0 && b.comment_count + b.heart_count === 0) return { line: `${who} shared new photos`, isReply: false };
  if (b.post_count === 0) return { line: `${who} replied to your photos`, isReply: true };
  return { line: `New photos and replies from ${who}`, isReply: false };
}

export function buildPush(b: Batch): PushMessage[] {
  if (b.push_tokens.length === 0) return [];
  const { line, isReply, one } = summary(b);
  return [{
    to: b.push_tokens,
    title: `From ${joinNames(b.actor_names)} on Hearth`, // BETA-NOTIFY-7: a real person, not a generic notice
    body: isReply ? `${line}. Tap to see.` : one ? `${line}. Tap to see it.` : `${line}. Tap to see them.`,
    sound: "default",
    data: { post_id: b.latest_post_id },
  }];
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Names go into email headers (From, Subject): keep only letters, digits and simple punctuation.
const headerSafe = (n: string) => n.replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 40);

/** null when no real person's name survives sanitizing: never send a nameless email (BETA-NOTIFY-7). */
export function buildEmail(input: Batch): Email | null {
  const b = { ...input, actor_names: input.actor_names.map(headerSafe).filter(Boolean) };
  if (b.actor_names.length === 0) return null;
  const { line, isReply, one } = summary(b);
  // No website yet -> no link (a dead link looks like a scam); plain words instead.
  const base = Deno.env.get("APP_LINK_BASE")?.replace(/\/$/, "");
  const link = base ? `${base}/p/${b.latest_post_id}` : null;
  const what = isReply || one ? "it" : "them";
  // BETA-NOTIFY-7: "Chase on Hearth <hello@…>". Only the address comes from RESEND_FROM;
  // the name is stripped of anything that could change the header.
  const addr = (Deno.env.get("RESEND_FROM") ?? "hello@hearth.family").match(/<([^>]+)>/)?.[1] ??
    Deno.env.get("RESEND_FROM") ?? "hello@hearth.family";
  const safe = headerSafe(joinNames(b.actor_names));
  const from = `${safe} on Hearth <${addr}>`;
  return {
    from,
    to: [b.email!],
    subject: `${line} on Hearth`,
    text: link ? `${line}.\n\nOpen Hearth to see ${what}:\n${link}\n` : `${line}.\n\nOpen Hearth on your phone to see ${what}.\n`,
    html: `<p style="font-size:20px">${esc(line)}.</p>` +
      (link ? `<p><a href="${esc(link)}" style="font-size:20px">Open Hearth to see ${what}</a></p>`
            : `<p style="font-size:20px">Open Hearth on your phone to see ${what}.</p>`),
  };
}

// ---------- I/O ----------
async function rpc(name: string, args: unknown): Promise<unknown> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${name} failed (${res.status})`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

type ExpoTicket = { status: "ok" | "error"; details?: { error?: string; expoPushToken?: string } };

// Returns the batches that failed. Collects tokens Expo says are gone into `dead`.
async function sendPushes(batches: Batch[], dead: Set<string>): Promise<Batch[]> {
  const failed: Batch[] = [];
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (expoToken) headers.authorization = `Bearer ${expoToken}`;
  for (let i = 0; i < batches.length; i += CHUNK) {
    const chunk = batches.slice(i, i + CHUNK);
    const msgs = chunk.flatMap(buildPush);
    try {
      const res = await fetch(EXPO_URL, { method: "POST", headers, body: JSON.stringify(msgs) });
      if (!res.ok) throw new Error(`expo ${res.status}`);
      const { data } = await res.json() as { data: ExpoTicket[] };
      for (const t of data ?? []) {
        if (t.status === "error" && t.details?.error === "DeviceNotRegistered" && t.details.expoPushToken) {
          dead.add(t.details.expoPushToken);
        }
      }
    } catch (_) {
      failed.push(...chunk);
    }
  }
  return failed;
}

async function sendEmails(batches: Batch[]): Promise<Batch[]> {
  const failed: Batch[] = [];
  for (let i = 0; i < batches.length; i += CHUNK) {
    const chunk = batches.slice(i, i + CHUNK);
    const emails = chunk.map(buildEmail).filter((e): e is Email => e !== null);
    if (emails.length === 0) continue; // nothing nameable to send; the notices stay closed
    try {
      const res = await fetch(RESEND_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${env("RESEND_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify(emails),
      });
      if (!res.ok) throw new Error(`resend ${res.status}`);
    } catch (_) {
      failed.push(...chunk);
    }
  }
  return failed;
}

function authorized(req: Request): boolean {
  const got = req.headers.get("authorization") ?? "";
  const allowed = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), Deno.env.get("NOTIFY_CRON_SECRET")]
    .filter((k): k is string => !!k).map((k) => `Bearer ${k}`);
  return allowed.includes(got);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  if (!authorized(req)) return new Response(null, { status: 401 });
  try {
    const batches = (await rpc("claim_notification_batches", {}) as Batch[]) ?? [];
    const push = batches.filter((b) => b.channel === "push");
    const email = batches.filter((b) => b.channel === "email" && b.email);
    const dead = new Set<string>();
    const failed = [...await sendPushes(push, dead), ...await sendEmails(email)];
    if (failed.length) await rpc("release_notifications", { p_ids: failed.flatMap((b) => b.outbox_ids) });
    if (dead.size) await rpc("forget_push_tokens", { p_tokens: [...dead] });
    const failedPush = failed.filter((b) => b.channel === "push").length;
    const out = { push: push.length - failedPush, email: email.length - (failed.length - failedPush), failed: failed.length };
    if (failed.length) console.warn(`notify: ${failed.length} batch(es) failed, released for retry`);
    return Response.json(out);
  } catch (e) {
    console.error(`notify: run failed (${e instanceof Error ? e.message.replace(/https?:\S+/g, "") : "error"})`);
    return new Response(null, { status: 500 });
  }
}

if (import.meta.main) Deno.serve(handler);
