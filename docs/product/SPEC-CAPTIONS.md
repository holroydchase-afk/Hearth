# Spec: post titles and captions (CAP-*)

Status: plan only, Oct 27, 2026. **Parked under the Polish Freeze**: nothing here is built until Chase says "lift Polish Freeze" or "go captions". Owner: staff-pm. Persona check: `docs/product/decisions/2026-10-27-post-titles-captions.md`. TRACKER row R21.

Chase, Oct 27: "the poster should be able to have a social media type post describing the set of pictures. Similar to Instagram and Facebook."

## What exists today

- One **caption** per post (one upload = one post = one moment card). Plain text, up to 2,000 characters (`posts.caption`, 0001). Typed in the Share screen's "What's happening?" box; empty is fine.
- The moment card (MOMENT-1..8, PR #54) shows the caption in full, between the card head and the collage, with no limit on lines.
- No title. No way to change the words after posting: BETA-SPEC lists "editing photos or captions" as out of the beta ("delete and repost"). The database already lets the author update `caption` under RLS, and refuses a removed member (S12, BETA-REPLY-4); there's no screen for it.
- Bulk sends (BatchReview) have no caption box: each post in the batch goes up with none.
- Captions are plaintext on Hearth's server (03-encryption-and-keys, "Captions, comments…"). They never go in a push, an email, a log or an error report (BETA-NOTIFY-2, PRIV-2, `scripts/check-logs.mjs`).

So Hearth already has half of a Facebook post. The gap is a **title**, a card that reads like a post rather than a photo with a note, **edit after posting**, and words on **bulk sends**.

## What we take from Instagram and Facebook, and what we don't

| Take | Leave out | Why |
|---|---|---|
| A short headline plus a longer description for the whole set | Hashtags | Nobody browses by tag in a 12-person family; tags are noise for LG |
| Long text folds to a few lines with "Read more" | @mentions and tagging people | Tagging means notices, a people picker and a child-name privacy question (BETA-NOTIFY-2). Name people in plain words instead |
| Edit after posting, with a small "Edited" | Tappable links | A tappable link in a grandparent's feed is a phishing door. Links show as plain text in v1 |
| Emoji in the words | Fonts, colored backgrounds, stickers | Deep, not wide; DS-2 type sizes |
| Comments and reactions under the words | AI-written captions | Chase, Oct 17: "no captions written for you" (AI-FEATURES R6). Not in this plan, on any tier |
| | Per-photo captions in v1 | See CAP-D1 below |

## Rules

- **CAP-R1 Always optional.** A post with a title, a caption, both or neither all send the same way. Nothing on the Share screen waits for words, and no prompt asks "Add a caption?" (A1 Anxiety-less, A2 Guilt-free; Bebar and Gigi just press Post).
- **CAP-R2 One set, one set of words.** The title and caption belong to the post (the whole set of photos), not to one photo.
- **CAP-R3 Words stay out of every notice, log and report.** Title is treated exactly like caption: never in push, email, `notify` logs, `client_errors`, the problem log, or a console line. `check-logs.mjs` adds `title` to its secret-ish names.
- **CAP-R4 Same audience as the photos.** Whoever can't see the post can't see its words: "not found", never a blank card (rule 2).
- **CAP-R5 Plain text.** No markup, no links, no mentions. Line breaks and emoji kept.

## Criteria

| ID | Pri | Given / When / Then |
|---|---|---|
| CAP-1 | P1 | **Given** the Share screen, **When** a poster picks photos, **Then** two boxes sit above "Who can see it": **Title** (one line, placeholder "Give it a name, like Lily's 5th birthday") and **What's happening?** (the caption, as today). Both say "(optional)" in their label |
| CAP-2 | P1 | **Given** a title, **When** it's typed, **Then** it stops at 80 characters (the box shows "12 left" from 20 left); the caption stays at 2,000. The server refuses longer with `23514` |
| CAP-3 | P1 | **Given** a moment card with a title, **When** it shows in Photos, **Then** the title sits under the head (sender, date, "to <groups>") in 20 pt semibold, read as a heading by VoiceOver and TalkBack, and the caption sits under it at 17 pt, above the collage (Facebook order: words, then photos) |
| CAP-4 | P1 | **Given** a caption longer than 4 lines at the reader's text size, **When** the card shows, **Then** it folds to 4 lines with a worded **Read more** button (48 pt); tapping shows it all and the button becomes **Show less**. No tap on the text itself is required |
| CAP-5 | P1 | **Given** a card with no title and no caption, **When** it shows, **Then** there's no empty space or placeholder: the collage follows the head, as today |
| CAP-6 | P1 | **Given** the sender's own card, **When** they open **More**, **Then** "Change the words" opens one sheet with the same two boxes filled in, plus **Save** and **Cancel**. Saving updates the card for everyone and adds "Edited" after the date |
| CAP-7 | P0 | **Given** someone other than the sender, or a sender removed from every group the post went to, **When** they try to change the words, **Then** it's refused (S12, BETA-REPLY-4); the app never shows them "Change the words" |
| CAP-8 | P1 | **Given** words were changed, **When** the change saves, **Then** no notice goes out, and comments and reactions on the card stay as they were |
| CAP-9 | P2 | **Given** a bulk send of 48 photos (BatchReview), **When** the poster adds a title there, **Then** every post in that batch carries the same title, caption left empty. One optional Title box, nothing else |
| CAP-10 | P0 | **Given** any push, email, digest, `notify` log, error report or problem-log entry, **When** it's generated for a titled post, **Then** it contains no title or caption words (extends BETA-NOTIFY-2, BETA-OPS-1) |
| CAP-11 | P2 | **Given** the event timeline and the year timeline, **When** a titled post shows there, **Then** it shows the title too, same rules as CAP-3 |
| CAP-12 | P2 | **Given** the web demo (`app/dist-demo-site`), **When** it's rebuilt, **Then** a few seeded moments carry titles and captions, so the portfolio shows the feature |

## Decisions for Chase (with Claude's picks)

| # | Question | Claude's pick |
|---|---|---|
| CAP-D1 | Words per photo too (a note on photo 3 of 8), or only for the whole set? | **Whole set only for now.** One box per photo turns a 48-photo send into 48 questions, and LG would wonder if they must fill them. Revisit after the beta if relatives ask; a per-photo note would live in the full-screen viewer |
| CAP-D2 | Allow changing the words after posting? (BETA-SPEC said "delete and repost") | **Yes, title and caption only, by the sender.** Delete and repost loses every comment and reaction; fixing a typo shouldn't cost that. Photos stay unchangeable |
| CAP-D3 | Encrypt the words (title, caption) so Hearth's server can't read them? | **Not in this build; with the family vault.** Encrypting them now breaks server-side search (SRCH-1/3) and adds a key step to every card. Today's honest line in `03-encryption-and-keys.md` already says the server can read them, and the threat model lists it as a gap |
| CAP-D4 | Title box shown by default, or behind an "Add a title" button? | **Shown, marked optional.** A hidden box is a gesture to discover; a labeled box Bebar can skip is simpler. grandparent-ux confirms on the prototype |

## Build plan (when the freeze lifts)

Size **M**, one PR, test-first. Order:

1. **Failing tests first** (qa-tdd): `backend/tests/captions_test.sql` (CAP-2, CAP-7, CAP-8 no notice, CAP-10 outbox payload), contract tests for `title` on `create_post`, `get_feed`/timeline RPCs and the new edit call, `app/src/screens/__tests__/captions.test.tsx` (CAP-1, 3, 4, 5, 6), and `check-logs.mjs` catching a logged `title`.
2. **Migration 0018** (app-engineer, privacy-security review): `posts.title text check (char_length(title) <= 80)`, `posts.words_edited_at timestamptz`; `create_post` gains `p_title default null` (old app builds keep working); feed and timeline RPCs return `title` and `words_edited_at`; `edit_post_words(p_post, p_title, p_caption)` checks author plus S12 and refuses `P0002` for a post you can't see. Notice triggers don't fire on it. Update `docs/eng/API.md` and its contract tests first (API.md rule).
3. **App**: `HearthApi` (Supabase and Fake), the upload queue carries `title`, ShareScreen and BatchReview boxes, PostCard title, fold and "Edited", the More sheet's "Change the words", demo seed.
4. **Docs in the same PR**: `02-data-flow.md` (Draft step names the title), `03-encryption-and-keys.md` (title joins the plaintext row), `04-threat-model.md` words list, their "Last checked" footers (rule 6); BETA-SPEC scope line for editing; DECISION-LOG entries for CAP-D1..D4; TRACKER and HANDOFF.
5. **grandparent-ux** pass on the words ("Title", "What's happening?", "Change the words", "Read more") and a prototype screenshot at 390 pt with Bigger text, before the app code. **ux-reviewer** before and after score (Polish Freeze rule).
6. Suite 3× green, `check-expo-go.sh`, then Chase's word to merge, deploy 0018 and publish.

## Not in this plan

Per-photo captions (CAP-D1), mentions, hashtags, links, text-only posts (TRACKER "Text cards in the timeline"), caption search (SRCH-1), encrypted words (family vault), and any AI help with words (R6).
