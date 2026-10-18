# Hearth architecture docs (white-paper source)

The living technical description of how Hearth works, written as we build. It exists for anchor **A4 White-paper ready** (`docs/product/ANCHORS.md`): any section here should lift into a white paper, a security page or a technical blog post with light editing, not a rewrite.

**Reader.** An intelligent, privacy-focused engineer, most likely in the tech industry, who will check our claims against the code. Write for that person. Grandparent-facing words stay in the app and in `GRANDPARENT-GUIDE.md`.

## Sections

| File | Covers | White-paper use |
|---|---|---|
| [01-system-overview.md](01-system-overview.md) | Components, vendors, where each piece of data lives | "Architecture" chapter; vendor appendix |
| [02-data-flow.md](02-data-flow.md) | Sign-in, posting, viewing, notices, deletion, step by step | "How a photo moves" chapter |
| [03-encryption-and-keys.md](03-encryption-and-keys.md) | Media format, key hierarchy, who can decrypt what, roadmap | "Encryption" chapter |
| [04-threat-model.md](04-threat-model.md) | Assets, adversaries, what we defend, what we don't yet | "Security model" chapter; honest limits |
| [05-access-control.md](05-access-control.md) | Family spaces, roles, groups, households, events, the one visibility rule, who reads replies | "Who sees what" chapter |

Planned sections: data retention and deletion once the purge worker exists; the family vault (E2EE) once specced.

## Writing rules

1. **True today, or labeled.** Every statement is one of **Built** (in `main`, cite the file), **Planned** (in a spec or the tracker, cite it) or **Gap** (known shortfall). No unlabeled future tense.
2. **Cite the code.** Name the file (`backend/supabase/functions/sign-media/index.ts`) so a reader can check. Code is the source of truth; when this doc and the code disagree, the doc is wrong.
3. **Claims match the register.** Anything a reader could quote as a promise must match "True today" in `docs/product/MARKETING.md` "Claims register". Never write "end-to-end encrypted", "zero-knowledge" or "Signal-level" about anything that isn't.
4. **Say what we can see.** For every flow, state what Hearth's servers and each vendor can read. The honest list of limits is the point; this audience distrusts docs without one.
5. **Each section stands alone.** Define terms on first use in that file, keep cross-links relative, and avoid "as discussed above" across files. Short paragraphs, tables for comparisons, no internal ticket jargon without a gloss (a BETA-* ID is fine in parentheses).
6. **Plain names.** "Groups" in prose (`circles` in code); "family space" for `spaces`.
7. **Footer.** Each file ends with `Last checked against code: <date>, <commit>`.

## Keeping it current

The rule (also in `CLAUDE.md`): **a PR that changes how data is stored, moved, encrypted, logged or shared updates the matching section here in the same PR**, and refreshes its "Last checked" footer. That covers migrations, edge functions, `app/src/crypto/`, `app/src/media/`, notification content, sign-in, and any new vendor (also a row in `docs/product/ACCOUNTS.md`).

- The PR author (usually `app-engineer`) makes the edit; `privacy-security` reviews changes to 03 and 04.
- If a PR can't update the doc, it adds a TRACKER row saying which section is stale.
- At each milestone gate, `staff-pm` checks that every footer is newer than the last change to the code it describes.
