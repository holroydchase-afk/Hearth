# Decision: one compact card per upload in Photos (MOMENT-1..8, UAT 8-9)
Date: Oct 24, 2026 · Status: built in a draft PR, decision to review (Chase asked for it Oct 19 and again Oct 24) · Source: UAT 9 ("a standard social media type photo feed with endless scroll"), prototype `prototype/moments.html`. Touches SWIPE-1..5, SESS-1..3, DEC-21, DEC-30, BETA-AUD-1/5, BETA-REPLY-6/11

**Sketch (grandparent-ux lane).** Before: a 6-photo card was about 860 pt on a 390 pt phone, more than a screen, and showed one photo at a time; under it came full-width rows for the caption, "Shared with…", Love it, a labeled reply box, its readers line, Send and Delete. After (measured on the web build at 390 pt): the same card is about 720 pt and shows four photos at once.
- Head: the sender, the date and, for the sender, "to <groups>", with a worded **More** button.
- A collage: 1 photo in its own shape (4:5 to 1.91:1), 2 side by side, 3 = one big and two, 4+ = one big and three with "+N". Every photo fills its tile; tapping one opens the full-screen viewer there (whole photo, Back and Next).
- "N people love this", then one row: **Love** and **Comment**, each a 48 pt worded button.
- The newest comment, "See all N comments" (a full-screen list with Close) when there are more, and the reply box as one row with **Send** beside it, with the readers line under it. DEC-30 keeps the box on every card; **Comment** puts the cursor in it.
- **More** holds "Who can see this" (the full "Shared with…" words) and, for the sender, "Delete this photo" or "Delete these N photos" with the usual confirm.
- Each upload is its own card (MOMENT-7): uploads within an hour no longer merge into one swipe (SESS-1..3), so hearts and replies always belong to the card you see. The event timeline inside an event keeps its swipe (EVT-7).

| Persona | Green/Red | Why |
|---|---|---|
| GG Great-grandparent who won't install | Green | Doesn't use the app; email and the web link are unchanged |
| LG Least-savvy grandparent | Red | Who-sees-it and Delete move behind More, one extra tap |
| AG Android grandpa | Green | Material buttons with words, 48 pt targets; four photos visible without swiping |
| SG Step or other-household grandparent | Green | Same card for everyone; the readers line stays under the reply box |
| CU Cousin | Green | A standard photo feed: collage, one action row, less scrolling |
| PA Posting parent | Green | Sees "to <groups>" on every card; Delete is one tap further, with the confirm |
| FA Far-away inviter | Green | Every button keeps unique words for "tap the one that says More" |
| TR Tech reader | Green | Layout only; no data, access or logging change |

Resolution: LG mitigation: the reply box, its readers line, Love and the photos stay on the card (DEC-30); More is a worded button, and "Who can see this" is its first line. Confirm with a relative in the next UAT session.
