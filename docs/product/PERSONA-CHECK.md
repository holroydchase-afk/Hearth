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
| PA Posting parent | Green | ... |
(one row per persona in the roster)

Resolution: <ID> mitigation: <change, test ID>
```

## Persona cards

The roster the script reads (IDs are the first two letters of each line):

<!-- personas:start -->
- PA: Posting parent
- FA: Far-away inviter
- LG: Least-savvy grandparent
- AG: Android grandpa
- SG: Step or other-household grandparent
- GG: Great-grandparent who won't install
- TR: Tech reader
<!-- personas:end -->

**PA Posting parent** (Chase, Mom; was "Megan")
- Phone/skill: recent iPhone; fluent, but short on time with young kids.
- Yes: share to Everyone in 3 taps, then stop thinking about it ("like the preschool app").
- Hard reds: any doubt about who sees a post; posting slower than a group text; a setting to babysit.
- Guards: A1, G4, G5.

**FA Far-away inviter** (Chase in Charlotte, Mom's sister in Texas; GOALS G3, not yet in PERSONAS.md)
- Phone/skill: recent phone; sets up a grandparent over a phone call without seeing their screen.
- Yes: the invite works on its own, and every step can be read aloud ("tap See the photos").
- Hard reds: icon-only or gesture steps; errors that don't say who to call; an empty first screen.
- Guards: G3, G1 (inviter sessions).

**LG Least-savvy grandparent** (June stand-in; Chase to name the person)
- Phone/skill: older phone, 1 bar of LTE, scam-wary; calls family instead of reading instructions.
- Yes: "just show me the babies": the photo fills the screen, nothing to learn.
- Hard reds: a new choice, picker or setting on her screens; anything slow on bad signal; a help call.
- Guards: G2, G1, rule 3.

**AG Android grandpa** (Grandaddy, Pawpaw, maybe Bebar)
- Phone/skill: Android, likely older and budget.
- Yes: the same photo, same quality, same features as the iPhone relatives.
- Hard reds: anything iPhone-only that he can see he's missing; blank emoji boxes; blurry copies.
- Guards: STORY problem 3 ("Somebody doesn't get the photo, or gets a blurry one"), G2.

**SG Step or other-household grandparent** (Grandmomma, Granny, Memaw, Gammy; was "Linda")
- Phone/skill: mostly iPhone; varies.
- Yes: full grandparent, never second-tier; can reply without the other house reading it.
- Hard reds: anything that ranks, counts or shows who looked; replies reaching the other household.
- Guards: A2, G4, the story's core line ("won't comment on each other's photos").

**GG Great-grandparent who won't install** (Bebar via the Aluratek frame; Gigi, Great-Grandma by email; was "Earl")
- Phone/skill: may never install an app.
- Yes: photos arrive on the frame or in email with nothing to do.
- Hard reds: a feature that only works in the app and makes the frame or email copy worse.
- Guards: milestone 6, CF-18.

**TR Tech reader** (the privacy-minded parent from tech who picks Hearth and checks the code; ANCHORS Oct 18)
- Phone/skill: expert; reads `docs/architecture/` against the code.
- Yes: every claim (US storage, location stripped, no AI, no ads) is true today and checkable.
- Hard reds: a claim the code doesn't back; a vendor or ID that links our copy to their iCloud or device.
- Guards: A3, A4, G6, rule 2.

## Gaps for the persona build-out

1. LG has no real person yet (PERSONAS.md "Chase to say"). Phones for most relatives are still "?"; the phone survey (CH-4) fills them.
2. FA isn't in PERSONAS.md yet (ANCHORS ideas log, Oct 18: "Proposed"). Added here as a check row now; Chase to confirm.
3. TR and PA are both Chase today. Split them only if a check ever goes Green for one and Red for the other for the same reason.
4. Retired: Rob (co-parent ex; the co-parent split stays protected by backend RLS tests), Kim, Tammy. Gammy's possible new partner isn't a persona yet; add one if a decision touches joining or removal.
5. Cards are one-liners from STORY.md and GOALS.md, not research. Each needs evidence (phone survey, M3/M4 Test Log entries, help calls) before a Green from that card can be trusted.
6. Next TDPM pieces, not built: a persona row type for the grandparent test result (pass/fail by tester), and a check that every BETA-* ID traces to a decision file.
