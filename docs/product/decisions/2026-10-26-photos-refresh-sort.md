# Decision: Photos refresh on their own; one header row with a system sort icon (UI-26)
Date: Oct 26, 2026 · Status: Chase's call ("it should auto refresh … default to system specific common icons like sort and update"), built in a PR · Touches R11 (RV-U3), BETA-TIME-2, DS-3, CLAUDE.md rule 3

**What changes.** The "Check for new photos" button is gone. Photos already refresh when the app opens and when it comes back to the front (BETA-SHARE-4), and pull-down refreshes too. "Show by date" becomes "By date" with the system sort icon (SF Symbol arrow.up.arrow.down, Material "sort"), sitting beside Messages in one row, so the first photo comes a row sooner. Filtering by group is parked (Polish Freeze).

| Persona | Green/Red | Why |
|---|---|---|
| GG Great-grandparent who won't install | Green | Doesn't use the app; email notices unchanged |
| LG Least-savvy grandparent | Green | One less button to guess about; new photos arrive without doing anything |
| AG Android grandpa | Green | Material sort icon with the words under it; pull-down works the same |
| SG Step or other-household grandparent | Green | No change to who sees what |
| CU Cousin | Green | Matches every photo app they use |
| PA Posting parent | Green | First photo sits higher on the screen |
| FA Far-away inviter | Red | Can't say "tap Check for new photos" when a relative thinks a photo is missing |
| TR Tech reader | Green | No data change; refresh calls are the same ones |

Resolution: FA mitigation: the app refreshes each time it's opened, so "close it and open it again" (or pull down) is the phone answer; check in the next UAT session.
