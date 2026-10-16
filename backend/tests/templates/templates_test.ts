// deno test --allow-read tests/templates/
// JOIN-2 / NOTIFY-7: the sign-in email carries the 6-number code in plain words, and
// no link (Supabase's default sends a link, and a link-only email looks like a scam).
const root = new URL("../../supabase/", import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root));

function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

for (const name of ["magic_link", "confirmation"]) {
  Deno.test(`JOIN-2: ${name} email has the code, plain words, and no link`, () => {
    const html = read(`templates/${name}.html`);
    assert(html.includes("{{ .Token }}"), "has the code");
    assert(!/ConfirmationURL|TokenHash|SiteURL|RedirectTo/.test(html), "no link variables");
    assert(!/href=|https?:\/\//i.test(html), "no links at all");
    assert(/font-size:\s*(3[2-9]|[4-9]\d)px/.test(html), "the code is big (32px+)");
    assert(/Hearth will never ask for a password/.test(html), "says what we never do");
    assert(/didn.t ask/i.test(html), "tells you what to do if you didn't ask");
  });
}

Deno.test("JOIN-2: config.toml uses both templates with a code in the subject", () => {
  const cfg = read("config.toml");
  for (const name of ["magic_link", "confirmation"]) {
    const block = cfg.split(`[auth.email.template.${name}]`)[1]?.split("\n[")[0] ?? "";
    assert(block.includes(`content_path = "./supabase/templates/${name}.html"`), `${name} content_path`);
    assert(/subject = ".*\{\{ \.Token \}\}.*"/.test(block), `${name} subject shows the code`);
  }
  assert(/otp_length = 6/.test(cfg), "6-number codes");
});
