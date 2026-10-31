# Decision: Hearth's own files say AGPL-3.0-or-later, the same as the messenger library
Date: Oct 31, 2026 · Status: default picked by Claude on Chase's "also do the AGPL work" (Chase can switch to -only before the first outside contribution) · Follows DEC-7 (AGPL-3.0) and DEC-42 (messenger, -or-later)

The root `LICENSE` (#71) left one question open: does Hearth's code say AGPL-3.0-only or -or-later? The messenger library already says -or-later, and mixing the two in one repo confuses readers and tools. -or-later is the FSF's recommended form and keeps Hearth compatible with a future AGPL version. Chase owns all the code, so dual licensing stays possible either way (DEC-7).

What changes: every source file in `app/src`, the edge functions and the messenger opens with `SPDX-License-Identifier: AGPL-3.0-or-later` and Chase's copyright line; `app/package.json` says the same. `scripts/check-spdx.sh` (LIC-1..3, in `test-all.sh`) keeps new files honest. SQL migrations are left alone because the applied ones must not change.

| Persona | Green/Red | Why |
|---|---|---|
| PA Posting parent | Green | Nothing changes in the app |
| FA Far-away inviter | Green | No effect on invites or setup |
| LG Least-savvy grandparent | Green | Never sees the license |
| AG Android grandpa | Green | No effect on Android |
| SG Step or other-household grandparent | Green | No effect on households |
| GG Great-grandparent who won't install | Green | No effect on email or frame |
| CU Cousin | Green | No effect on what they see or do |
| TR Tech reader | Green | One clear license on every file, machine-readable, matching the library |
