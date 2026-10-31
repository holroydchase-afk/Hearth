# Decision: the owner's "Photo helpers" switches on Me (HELP-R6)
Date: Oct 31, 2026 · Status: night shift, built in a draft PR, under "Decisions to review" (DEC-45) · Touches HELP-R4, DEC-18, TRACKER R17

**What changes.** The family's owner gets a "Photo helpers" card on Me with two switches for the whole family: "Set aside repeats" (the same photo twice, look-alikes, photos sent in the last 30 days) and "Set aside screenshots and blurry photos". Before this, turning one off was a database row. Nobody else sees the card. The line above the switches says they apply only to 4 or more photos, every set-aside photo has Put back, and nothing is deleted from the phone. grandparent-ux scored the first words 7/10. Its replacement lines are what was built (code read only, not yet seen on a phone).

| Persona | Green/Red | Why |
|---|---|---|
| GG Great-grandparent who won't install | Green | Never sees the card or the helpers; email, web and frame unchanged |
| LG Least-savvy grandparent | Green | Never sees the card; helpers need 4+ photos, and each has Put back |
| AG Android grandpa | Green | Same words and switches on Android |
| SG Step or other-household grandparent | Green | Doesn't see the card; one family-wide setting, so no household is treated differently |
| CU Cousin | Green | Not slowed down; Put back stays one tap |
| PA Posting parent | Green | Scope and safety are clear in under 3 seconds |
| FA Far-away inviter | Green | "For the whole family" is easy to explain over the phone |
| TR Tech reader | Green | "Nothing is deleted from the phone" and on-phone-only helpers (HELP-R2) |
