# Decision: Photos header buttons two to a row (R11, RV-U3)
Date: Oct 21, 2026 · Status: built, decision to review (night shift; grandparent-ux sketch below) · Source: app review RV-U3. Touches DS-1, DS-3, SPEC-MESSENGER, EVT-4, BETA-TIME-1

**Sketch (grandparent-ux lane).** Before: up to six full-width buttons came before the first photo (Messages, See events, your name, Check for new photos, Show by date, older-photos cards), so on a small phone the first photo sat below the fold. After: Messages and See events share one row; Check for new photos and Show by date share another. Each button keeps its own words, a 48 pt target and at least 150 pt of width; a long label wraps to two lines rather than shrinking. With Bigger text (21 pt) a row wraps to one button a line, so nothing gets squeezed. Pull to refresh stays, but "Check for new photos" stays as the worded way to do it (no gesture-only actions). Nothing moved off the screen: RV-U3's idea of moving "Show by date" to the bottom was dropped, because Photos keeps loading older posts as you scroll and the bottom is rarely reached.

| Persona | Green/Red | Why |
|---|---|---|
| GG Great-grandparent who won't install | Green | Doesn't use the app; email and the web link are unchanged |
| LG Least-savvy grandparent | Green | Same four worded buttons in the same order, and the first photo shows without scrolling |
| AG Android grandpa | Green | Outlined Material buttons with words; 48 pt targets; wraps on a narrow old phone |
| SG Step or other-household grandparent | Green | Sees the same header as everyone; nothing about who sees what changes |
| CU Cousin | Green | Less scrolling to reach new photos |
| PA Posting parent | Green | Your name and sending status still sit under the buttons |
| FA Far-away inviter | Red | Phone instructions like "the third button down" change |
| TR Tech reader | Green | Layout only; no data change |

Resolution: FA mitigation: every button keeps its unique words, so "tap the one that says Show by date" still works (G3); `docs/product/MILESTONE-1.md` gives no position-based steps for these buttons.
