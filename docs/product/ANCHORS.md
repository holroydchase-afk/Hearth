# Hearth anchors, milestones and ideas log

Source of truth for *why* Hearth exists and what every feature is checked against. The fuller story (Chase's family, problems and solutions, WV vs Charlotte) lives in `docs/product/STORY.md`.

**Rules for every session**
- When Chase names a new anchor, add it here. `docs/product/STORY.md` and this file are the source of truth; the claude.ai doc is no longer kept in sync.
- When Chase floats an idea, add it to the Ideas log below.
- Never delete an already-built feature to satisfy an idea or anchor. Log the conflict and let Chase decide.

## Milestones (Chase, Oct 16, 2026)

Hearth is a **proof of concept first**: a birthday present Chase is building himself, because these problems are his own, plus experience for future jobs. These milestones supersede the startup-style Ring 0–3 plan. Reconciled Oct 16: `docs/product/BETA-SPEC.md` ("Milestone map and trace") and `docs/product/REMAINING.md` (milestone critical path).

1. **Birthday present.** Chase uses it himself, end to end.
2. **Wife.** Both households' posting works.
3. **The most tech-savvy relative** (about 1 person).
4. **Everyone else, in order of tech-savviness** (most savvy first, least savvy last). Each step fixes what confused the last group.
5. **Android relatives** (the grandpas), once the iPhone side is solid.
6. **Nice to have:** POC on an Aluratek smart frame for great-grandpa. First check whether the model accepts photos by email or a shared link; if it only takes its own app, skip it.
7. **Then decide.** Look at costs and the problems people hit; decide whether to take it further.

Not required for the POC: funding, pricing, self-hosted auth, pentest, legal review. Those come at milestone 7 if the answer is yes.

## Anchors

| # | Anchor | What it means | Named |
|---|---|---|---|
| A1 | **Anxiety-less** | Parents already carry enough. Sharing feels like the preschool app: secure, exclusive to people you trust, nothing to second-guess about who sees what. | Oct 16, 2026 |
| A2 | **Guilt-free** | Nobody, sender or viewer, feels judged. No visible view tracking, last-seen or login details. Neither side of a family can tell whether the other is or isn't engaging, beyond what people choose to show (hearts, comments). | Oct 16, 2026 |
| A3 | **Stays on US soil** | Kids' photos, videos and family data are stored in the US, by US companies, never sent to China or anywhere else. A hard constraint on every vendor and feature. | Oct 16, 2026 |

**A3 gaps today.** Media and database are in US regions (Supabase East US, Backblaze US East). Not yet literally "never leaves US soil": Supabase processes some auth logs and support access outside the US and contracts through a Singapore entity; push alerts transit Apple/Google global networks (no photos or names in them). Public wording stays **"stored in the US"** until closed. Closing = self-hosted auth on US infrastructure (`docs/eng/research.md` §4), a post-POC item.

**A3 positioning.** Lead with "your kids' photos never leave the US / never sent to China", not partisan politics. Split families span both sides.

**Candidate anchors (Claude's wording, not adopted):** kids' privacy is non-negotiable; built for the least techy person in the family; no social-media mechanics.

### Built features that conflict with A2 (logged, not deleted)

| Feature | Where | Conflict |
|---|---|---|
| "Seen by N of M" on your own posts | BETA-NOTIFY-6, CF-20, prototype | The poster can see who hasn't opened it |
| "Hasn't opened anything in 14 days" | CF-22 (v1.0) | Shames quiet relatives |
| Grandparent engagement as a gate/funding metric | ring gates, funding plan | Fine if internal and aggregate only; never shown to family |
| Ring 3 exit "opened at least 1 post" and success signal "80% open within 24 h" | BETA-SPEC ring gates (now superseded) | Measures each person's opens. Fine as an aggregate Chase-only number; must never be shown per person in the app |

| Comments are seen by the post's whole audience | BETA-REPLY-2, `comments_select` RLS | Not A2 but the story's core line: a post to both sides lets Grandpa B read Grandma A's comment. Options: (a) keep, with honest wording (REPLY-6, doing now); (b) a comment is seen by the poster plus people who share a group with the commenter; (c) comments go to the poster only. staff-pm leans (b), with privacy-security review. Decide before milestone 4 |

**Status Oct 16:** still awaiting Chase's decision. staff-pm has not resolved it. NOTIFY-6 is flagged in the BETA-SPEC trace table.

Decide before milestone 4 (when grandparents on different sides join). Options: keep for poster only (today), remove, or opt-in by each viewer.

## Ideas log (newest first)

| Date | Idea | Anchor | Status | Notes |
|---|---|---|---|---|
| Oct 16 | **Parents set it up; everyone else just posts** (Chase): parents create groups and own the sharing settings (others may get them later). Anyone in a group posts freely, and Hearth keeps privacy the way the parents set it up. Initially very simple and intuitive | A1, A2 | Direction; model to confirm with Chase before building | Replaces the per-group "members see each other's replies" switch (built, Chase doesn't want it; not removed until he decides). Relatives get no privacy settings |
| Oct 16 | **Groups in a flexible hierarchy; all visibility follows groups** | A1, A2 | Chase's direction; staff-pm to spec | Example only, not a fixed shape: one person → immediate family on a side → whole side → whole family, plus any other groups. People organize them by selecting or dragging, or through a guided setup. Comments and hearts follow the same groups (answers "who sees comments"). Today's groups are flat |
| Oct 16 | What happens when the family-space **owner** deletes their account | A1 | Decide before milestone 3 (Beta App Review) | The app hides "Take me off Hearth" from owners. The server today would hide all their posts but keep them as owner, so the family would lose the photos. Options: hand the space to another adult first, keep the photos, or delete the space |
| Oct 16 | Video is a story problem (stepmom sent separately, in-laws offended), not a nice-to-have | Story | Revisit at M4 | SHARE-6 stays deferred until a transcode proves location-free |
| Oct 16 | Trace flags: JOIN-7 traces to an Apple rule; AUD-4's co-parent case traces to the Rob persona, not Chase's story | Trace check | Logged | Both kept; JOIN-7 needed at M3 |
| Oct 16 | AI positioning session | A1, A2, A3 | To schedule | Agenda below |
| Oct 16 | Upload 30 photos, Hearth suggests the best few | Parental guilt | Waits on AI session | Could run on-device with no training. Conflicts with CF-10's "no ML of any kind" as written |
| Oct 16 | Duplicate / near-duplicate detection | A1 | Waits on AI session | Same on-device question |
| Oct 16 | AI-assisted onboarding | A1 | Waits on AI session | e.g., set up groups from a plain description of the family |
| Oct 16 | Hide or remove engagement signals | A2 | Decide before milestone 4 | See conflicts table; built code stays until decided |
| Oct 16 | Never show login or last-active details to anyone | A2 | Proposed for Never build | Current design already shows none |
| Oct 16 | No photo filters | No social-media mechanics | Proposed for Never build | Chase said it directly |
| Oct 16 | Great-grandparents as a named audience in personas | Rural / low-tech | Proposed | Add to `docs/product/PERSONAS.md` |
| Oct 16 | Gold-standard security; privacy intuitive and advanced | A1 | In progress | `privacy-security` agent raised; scaled to the POC |
| Oct 16 | Shared-iCloud-album comparison test | Validation | Suggested | One week with a few iPhone relatives; shows what Hearth must beat |

### AI positioning session (agenda)

Question: what can Hearth say about AI that stays true and still allows helpful tools?

1. Words: "training" (a model learns from your photos) vs "processing" (a program looks at a photo once). "No computer program learns from your photos" can stay true under on-device processing.
2. Options:
   - **A. No ML anywhere.** Simplest promise; loses best-shot, duplicates, smart onboarding.
   - **B. On-device only, opt-in.** Photo never leaves the phone for AI. Claude's pick. Satisfies A3.
   - **C. Server-side under a no-training contract.** Most capable; breaks Never build #3, hardest to explain, must also satisfy A3.
3. Which features are worth it: best-shot, duplicates, onboarding, caption help.
4. If B: update CF-10's "done when", privacy policy, Never build list, grandparent wording.
5. Reviewers: privacy-security (data flow), grandparent-ux (wording).
