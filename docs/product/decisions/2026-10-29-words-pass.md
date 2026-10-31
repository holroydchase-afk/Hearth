# Decision: words pass on titles, changing words, Messages and Share (WORDS-1..4)
Date: Oct 29, 2026 · Status: night shift, built in a draft PR, under "Decisions to review" (DEC-43) · Touches CAP-1, CAP-6, MSG-1, BETA-AUD-1, DS-3

**What changes.** grandparent-ux read the new words (score 7/10 before, 8.5/10 with these changes; code read, not yet on a phone).
- WORDS-1: the caption box's hint says "Say what's happening. The groups you pick will see it." instead of "(Grandma will see this)", which was untrue for a post sent only to one side.
- WORDS-2: a refused "Change the words" says "These words can't be changed now. Your old words are kept." instead of "You can't do that here."
- WORDS-3: the Messages privacy line ends "Not even Hearth can read it: messages are locked on your phone before they are sent." instead of "Hearth can't: …", which read as a cut-off sentence.
- WORDS-4: on Share and the bulk review, a group shows its name alone, and the count starts the line of names ("3 people: Grandma Jo, …"), so the name never wraps around its count at large text. Spoken labels are unchanged.
- Kept: "Title (optional)", "What's happening?" without "(optional)" (answers SPEC-CAPTIONS' open question), "Change the words", "Edited", Read more / Show less.

| Persona | Green/Red | Why |
|---|---|---|
| GG Great-grandparent who won't install | Green | Doesn't use the app; emails unchanged |
| LG Least-savvy grandparent | Green | A refusal now says nothing was lost, so no "I broke it" call |
| AG Android grandpa | Green | Group names stay whole at 200% text (confirm on an older Android) |
| SG Step or other-household grandparent | Green | The caption hint no longer promises "Grandma" sees a one-side post |
| CU Cousin | Green | Same words they already know |
| PA Posting parent | Green | The count still sits next to each group, now with the names |
| FA Far-away inviter | Green | Can still say "tick Grandparents – Dad's side" over the phone |
| TR Tech reader | Green | "Not even Hearth can read it" matches the MLS design (06-messenger.md) |
