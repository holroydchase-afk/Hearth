# Decision: a home-screen photo frame widget, plus a send-progress Live Activity for posters (FRAME-*)
Date: Oct 29, 2026 · Status: Chase's ("Start with 1", picking idea 1 of 3 bleeding-edge features) · Source: `docs/product/SPEC-PHOTO-FRAME.md`, DEC-40

| Persona | Green/Red | Why |
|---|---|---|
| GG Great-grandparent who won't install | Green | App-only, but email and frame paths are unchanged |
| LG Least-savvy grandparent | Red | Adding a widget is a hidden press-and-hold gesture |
| AG Android grandpa | Green | Same widget, photo and words on Android (FRAME-R5) |
| SG Step or other-household grandparent | Green | Shows only posts they already see; no counts |
| CU Cousin | Green | Newest kid photo without opening another app |
| PA Posting parent | Green | No photo on lock screen; send progress visible |
| FA Far-away inviter | Green | Guide step is readable aloud: "add the Hearth photo" |
| TR Tech reader | Green | Reads the local cache; nothing new leaves the phone |

Resolution: LG mitigation: the widget is optional and never asked for in the app; a helper adds it during setup from the printed guide (FRAME-R4), and push notices still work without it.
