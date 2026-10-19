# Persona check (TDPM: test-driven product management)

Owner: staff-pm. First version Oct 19, 2026. Chase, Oct 19: "I want to develop something like TDD but TDPM ... tests or rules that we run through ... before we make product decisions. for starters I want some simplistic form of each persona, green or red, short summary why."

## The rule

**No product decision is final until it has a persona check run and recorded** (CLAUDE.md rule 9). TDD for product: the check is the test, and a decision ships only when it passes.

- A check is one file in `docs/product/decisions/`, one row per persona below, each **Green** or **Red** with a why of 15 words or fewer.
- **Red blocks** unless the file has `Resolution: <ID> mitigation: ...` (what changes so the persona is safe) or `Resolution: <ID> Chase override (<date>): ...` (Chase accepts the cost, in his words).
- `scripts/check-persona-checks.sh` enforces this in CI and `test-all.sh`: a missing persona, a value other than Green/Red, a why over 15 words, or an unresolved Red fails the build. Its tests: `scripts/tests/check_persona_checks_test.sh` (TDPM-1).
- **Adding a persona breaks every old decision on purpose.** Each needs the new row before CI is green again: that is the re-run.

## How to run one

1. Name the decision in one line and link its source (Chase's words or a spec ID).
2. For each card below, ask: does this trip a hard red? Does it serve the yes? Write Green or Red and the why. Judge the decision as specced, not as hoped.
3. For each Red, write the mitigation (a spec change, with its test ID) or ask Chase for an override. Never turn a Red Green by rewording the why.
4. Set Status: `proposed` (staff-pm) or `Chase's` (he said so; quote him). Run `bash scripts/check-persona-checks.sh`.
5. Copy the template:

```
# Decision: <one line>
Date: <date> · Status: proposed | Chase's · Source: <quote or spec ID>

| Persona | Green/Red | Why |
|---|---|---|
| GG Great-grandparent who won't install | Green | ... |
(one row per persona in the roster)

Resolution: <ID> mitigation: <change, test ID>
```

## Persona cards

Ranked from the least tech-savvy smartphone user up (Chase, Oct 19: "ranked from least tech-savvy smartphone user up"; his order: Bebar 95, Gigi 88, Great-Grandma 85, Grandaddy 62, Sue 60, Pawpaw 68, Grandmomma 58, Granny 60; then the cousins, "they will be my age and some are parents"). AG is the one card that isn't a skill rank: it is the phone, and it sits on top of LG for Grandaddy and Pawpaw. Decision tables list the personas in this order.

The roster the script reads (IDs are the first two letters of each line):

<!-- personas:start -->
- GG: Great-grandparent who won't install
- LG: Least-savvy grandparent
- AG: Android grandpa
- SG: Step or other-household grandparent
- CU: Cousin
- PA: Posting parent
- FA: Far-away inviter
- TR: Tech reader
<!-- personas:end -->

| Rank | Person (age, Chase's words) | Card |
|---|---|---|
| 1 | Bebar, 95, "better on a computer than Gigi" | GG |
| 2 | Gigi, 88 | GG |
| 3 | Great-Grandma, 85 | GG |
| 4 | Grandaddy, 62 | LG, AG |
| 5 | Sue, 60 | LG |
| 6 | Pawpaw, 68 | LG, AG |
| 7 | Grandmomma, 58 | SG |
| 8 | Granny, 60 | SG |
| 9 | Cousins: three cousin couples (Chase's age) | CU |
| 10 | Chase, Mom | PA, FA, TR |
| 11 | Mom's sister in Texas | FA |

**GG Great-grandparent who won't install** (ranks 1–3: Bebar 95, Gigi 88, Great-Grandma 85; was "Earl")
- Phone/skill: the least savvy on a smartphone; may never install an app. Bebar is better on a computer than Gigi and has the Aluratek frame.
- Yes: photos arrive on the frame, in email or on a computer, with nothing to do.
- Hard reds: a feature that only works in the app and makes the frame or email copy worse; anything they must set up.
- Guards: milestone 6, CF-18.

**LG Least-savvy grandparent** (ranks 4–6: Grandaddy 62, Sue 60, Pawpaw 68; the June stand-in, now named)
- Phone/skill: the least savvy grandparents who will use the app; scam-wary, spotty WV signal; call family instead of reading instructions. Two of three are on Android (AG).
- Yes: "just show me the babies": the photo fills the screen, nothing to learn.
- Hard reds: a new choice, picker or setting on their screens; anything slow on bad signal; a help call.
- Guards: G2, G1, rule 3.

**AG Android grandpa** (Grandaddy, Pawpaw; maybe Bebar. Not a skill rank: the phone)
- Phone/skill: Android, model and age unknown.
- Yes: the same photo, same quality, same features as the iPhone relatives.
- Hard reds: anything iPhone-only that he can see he's missing; blank emoji boxes; blurry copies.
- Guards: STORY problem 3 ("Somebody doesn't get the photo, or gets a blurry one"), G2, milestone 5.

**SG Step or other-household grandparent** (ranks 7–8: Grandmomma 58, Granny 60, the savviest grandparents; was "Linda". The household rule also covers Sue and Grandaddy's split households)
- Phone/skill: more at ease than LG; phones not confirmed.
- Yes: full grandparent, never second-tier; can reply without the other house reading it.
- Hard reds: anything that ranks, counts or shows who looked; replies reaching the other household.
- Guards: A2, G4, the story's core line ("won't comment on each other's photos").

**CU Cousin** (rank 9: three cousin couples; new Oct 19)
- Phone/skill: Chase's age; "some are parents". Phones not known.
- Yes: the family's kid photos in one place, without another group text to mute.
- Hard reds: a post meant for one household reaching them; anything that feels like the social media Hearth replaces (counts, follows, feeds).
- Guards: A1, A2, G4. Cousins who are parents may want to share their own kids: that is a second family space, not in scope (deep, not wide).

**PA Posting parent** (rank 10: Chase, Mom; was "Megan")
- Phone/skill: recent iPhone; fluent, but short on time with young kids.
- Yes: share to Everyone in 3 taps, then stop thinking about it ("like the preschool app").
- Hard reds: any doubt about who sees a post; posting slower than a group text; a setting to babysit.
- Guards: A1, G4, G5.

**FA Far-away inviter** (ranks 10–11: Chase in Charlotte, Mom's sister in Texas; GOALS G3. Kept by default, Chase hasn't answered)
- Phone/skill: recent phone; sets up a grandparent over a phone call without seeing their screen.
- Yes: the invite works on its own, and every step can be read aloud ("tap See the photos").
- Hard reds: icon-only or gesture steps; errors that don't say who to call; an empty first screen.
- Guards: G3, G1 (inviter sessions).

**TR Tech reader** (top: the privacy-minded parent from tech who picks Hearth and checks the code; Chase today; ANCHORS Oct 18)
- Phone/skill: expert; reads `docs/architecture/` against the code.
- Yes: every claim (US storage, location stripped, no AI, no ads) is true today and checkable.
- Hard reds: a claim the code doesn't back; a vendor or ID that links our copy to their iCloud or device.
- Guards: A3, A4, G6, rule 2.

## Gaps for the persona build-out

1. **Questions for Chase (Oct 19 ranking):**
   - Which phone does each person on the list have (iPhone or Android, roughly how old)? Only Grandaddy and Pawpaw are known Android; Bebar is "Android?". The phone survey (CH-4) fills this.
   - Is Grandmomma Grandmomma (PERSONAS.md says "Grandmomma")?
   - Gammy isn't in the ranking. Where does she fall?
   - Bebar: computer better than Gigi. Should his way in be email on the computer rather than (or beside) the frame?
   - Cousins: which of them get invited for the beta, and do they sit in a side's group or only Everyone?
   - Far-away inviter: keep as a persona (kept by default)? Does Mom's sister count as an inviter in the beta?
2. Milestone 4 order ("most savvy first, least savvy last") now follows this table read bottom-up: cousins and Granny/Grandmomma before Grandaddy/Sue/Pawpaw, great-grandparents last. Chase to confirm.
3. TR and PA are both Chase today. Split them only if a check ever goes Green for one and Red for the other for the same reason.
4. Retired: Rob (co-parent ex; the co-parent split stays protected by backend RLS tests), Kim, Tammy. Gammy's possible new partner isn't a persona yet; add one if a decision touches joining or removal.
5. Cards are one-liners from STORY.md, GOALS.md and Chase's ranking, not research. Each needs evidence (phone survey, M3/M4 Test Log entries, help calls) before a Green from that card can be trusted. The CU card is the thinnest.
6. Next TDPM pieces, not built: a persona row type for the grandparent test result (pass/fail by tester), and a check that every BETA-* ID traces to a decision file.
