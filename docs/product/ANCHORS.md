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

**Status Oct 17 (reworked 3 am):** resolved by groups and households (Chase's 2:47 am answer): a relative's reply reaches their household(s), their event-mates on event posts, the parents and the post's author (option b, by household). `docs/product/SPEC-GROUPS.md` §6, BETA-REPLY-7 to 10. Built code (0009) stays until migration 0011 replaces it. NOTIFY-6 is flagged in the BETA-SPEC trace table.

Decide before milestone 4 (when grandparents on different sides join). Options: keep for poster only (today), remove, or opt-in by each viewer.

## Ideas log (newest first)

| Date | Idea | Anchor | Status | Notes |
|---|---|---|---|---|
| Oct 18 | **Text message codes as the default sign-in** (Chase): "I want texts to be the primary and default way folks receive their OTP." Email stays as a fallback | A1 | Idea; not built. **staff-pm owns timing** (tracker D11) | Supabase supports phone sign-in through an SMS provider (Twilio, MessageBird, Vonage, Textlocal). Costs: per-text fees plus US carrier registration (A2P 10DLC or toll-free verification), which can take days to weeks and may want a business name. A3: pick a US provider. Risk: SIM-swap; keep the "never read this code to anyone" warning in the text. Touches JOIN-2, invites and the grandparent guide. BETA-SPEC currently rules out SMS (Twilio, A2P) |
| Oct 18 | **Other sign-in options, including Sign in with Apple** (Chase, while setting up Supabase sign-in) | A1 | Idea; explore after milestone 1 (tracker D12) | Apple needs the $99 developer account and the app ID, so it comes after "Name final". App Store rule: if we add Google or other social sign-in, Apple must be offered too. Grandparent-ux reviews which buttons appear on the first screen |
| Oct 17 | **Signal-level privacy** (Chase, via marketing): "hyperfocus on privacy" for privacy-aware, tech-savvy parents | A1, A3 | Idea; not built. **Chase, Oct 17: yes to an opt-in E2EE vault after the beta, called "the family vault"; "could have some cool ui/ux".** UX ideas (draft, not specced): a lock on vault posts; letting someone in happens phone to phone, like handing over a house key; a printed recovery card kept with important papers; grandparents never type a code. staff-pm owns timing, privacy-security owns the design | Six-step ladder in MARKETING.md "Privacy-first path": plain disclosure page (CF-13), content-free push, per-family keys, encrypted captions/replies, open source + review, opt-in E2EE vault. Full E2EE is CORE-FEATURES question 2 and the parking lot; it risks lost photos for grandparents (A1) |
| Oct 17 | **"Personal server"** (Chase, moat question, via marketing): one of his 4 candidate moats. Meaning not yet settled: self-hosting at home, or a dedicated per-family store Hearth runs in the US | A3 | Idea; not built. **staff-pm owns the call** | Marketing can't claim it. Self-hosting is already offered by Ente and Immich, and non-techy relatives won't run a box. A per-family bucket/key in the US is closer to A3 but adds cost. See MARKETING.md "Competition and moat" |
| Oct 17 | **Caption search, later** (overnight plan, staff-pm): Postgres full-text search on captions, inside RLS, if a relative asks. No search box in the beta: "Jump to year" and "From [person]" on the timeline cover "find the ones from Christmas" | A1, A3 | Idea; not built (milestone 4+ if asked) | Never AI, face or object search: it would send media to a model (rule 2, A3). Captions are plaintext columns, so this stays cheap |
| Oct 17 | **Set groups, households slightly under them, events as the combiner** (Chase, 2:47 am): "I'd rather have set groups with the work around to have folks in multiple groups or households." Siblings sit on both mom's and dad's side. "Simple UX but hyper flexible for future" | A1, A2 | **Specced:** `docs/product/SPEC-GROUPS.md`, BETA-AUD-11 to 22, REPLY-7 to 13. 3 one-word questions open (§9) | Replaces the hierarchy spec. A person can be in several households (Danielle's sister in Memaw's and Pawpaw's houses) |
| Oct 17 | **Roles; maybe only parents send to Everyone** (Chase, 2:47 am): "we also need to invest time into roles" | A1 | **Specced:** owner, parent, relative; one `can(space, capability)` check (§4, AUD-21) | Later: per-person grants (`member_grants`), e.g. Gammy can send to Chase's side, an aunt can make events. Not built |
| Oct 17 | **Share history: "Share all past photos" or "Only new photos", no default** (Chase, 2:47 am, "shell history" read as share history) | A1 | **Specced:** §5, AUD-19, AUD-20 | "New" = shared from now on, so old photos bulk-imported later count as new. Later: a screen to change the choice (script-only now); a past-photo count on the choice |
| Oct 17 | **Family coordination hub** (Chase): Hearth grows from photos into "all things coordination with the family", such as sending all the invites for an occasion, and events expand dramatically over time | A1 | Long-term direction; not in BETA-SPEC | Builds on the groups hierarchy and events. staff-pm (Oct 17): cut from build; room left (event dates, RSVP rows, occasion invites read event membership) in `docs/product/SPEC-GROUPS.md` §3 |
| Oct 17 | **Group chat** (Chase): a conversation for a group, household or event | A1, A2 | Idea; cut from build (Oct 17) | Must follow the same hierarchy rules as replies, so a relative never talks to someone they can't see. Room left: a conversation hangs off one event or group and reads its membership (`docs/product/SPEC-GROUPS.md` §3) |
| Oct 17 | **Sharing and replies both follow the hierarchy** (Chase's question on the Everyone/events/households proposal): a post goes to any level (Everyone, a side, a household) and everything under it; households are the bottom level, and a relative's replies stay in their household plus the parents; events are a temporary branch made from picked levels | A1, A2 | **Superseded Oct 17, 2:47 am** by set groups + households + events (row above). Spec: `docs/product/SPEC-GROUPS.md` | Would replace separate "households for replies". **Decided: remove the per-group "members see each other's replies" switch** when the hierarchy rule replaces it |
| Oct 16 | **Events**: a "room" for an occasion (e.g. the birthday at Gigi's, where Chase's dad's side and Danielle's dad's side were there), so its photos go only to those groups | A1 | **Specced, minimal (Oct 17, 3 am):** an event = a name plus picked groups and households; also the custom group; event-mates read each other's replies (question 1) | Charleston trip and Gigi's birthday are events. Dates, place, RSVPs, chat later (`docs/product/SPEC-GROUPS.md` §3); "New event" screen at M4 (AUD-22) |
| Oct 16 | **Build for all family types, optimized for highly complex families** (Chase); **"distributed families"** is the term | A1, A2 | Design principle | Also in STORY.md and MARKETING.md. Simple families must still find it simple. Applied in `docs/product/SPEC-GROUPS.md` (a simple family only ever taps Everyone) |
| Oct 16 | **90% of posts go to everyone** (Chase) | A1 | Design input; specced | "Everyone" must be the one-tap default; narrower audiences are the exception. BETA-AUD-17 in `docs/product/SPEC-GROUPS.md` |
| Oct 16 | **Parents set it up; everyone else just posts** (Chase): parents create groups and own the sharing settings (others may get them later). Anyone in a group posts freely, and Hearth keeps privacy the way the parents set it up. Initially very simple and intuitive | A1, A2 | Specced (Oct 17): `docs/product/SPEC-GROUPS.md` §4 roles (owner, parent, relative). Relatives have no settings; relatives posting is M4 (BETA-REPLY-13) | Replaces the per-group "members see each other's replies" switch (built; Chase decided Oct 17 to remove it once the hierarchy rule replaces it). Relatives get no privacy settings |
| Oct 16 | **Groups in a flexible hierarchy; all visibility follows groups** | A1, A2 | **Reshaped Oct 17, 2:47 am:** a fixed shape (Everyone, set groups, households), not a free tree; events are the flexible piece. `docs/product/SPEC-GROUPS.md`. Nesting stays possible later by allowing one more link pair (§7) | Example only, not a fixed shape: one person → immediate family on a side → whole side → whole family, plus any other groups. People organize them by selecting or dragging, or through a guided setup. Comments and hearts follow the same groups (answers "who sees comments"). Today's groups are flat |
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
