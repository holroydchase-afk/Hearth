# Decision: speed architecture A1 to A4, and no-model photo helpers specced now
Date: Oct 21, 2026 · Status: approved (Chase, Oct 21 03:43Z: "I like 1-4 and duplicates, screenshot filtering and blurry-photo filtering ... could be specced now") · Source: night shift review, `docs/product/reviews/2026-10-21-app-review.md`

A1 native encryption in the app's own build (JavaScript stays in Expo Go). A2 send photos in parallel and prepare the next post while one sends. A3 keep Photos on the phone so it opens instantly and offline. A4 resumable video uploads. Plus specs for AI-2 duplicates and AI-4 screenshot and blurry-photo filtering, with no model.

| Persona | Green/Red | Why |
|---|---|---|
| GG Great-grandparent who won't install | Green | Emailed photos unchanged; nothing new to learn |
| LG Least-savvy grandparent | Green | Photos open faster and work offline; no new buttons |
| AG Android grandpa | Green | Old phones gain most from native encryption and the local copy |
| SG Step or other-household grandparent | Green | Same audiences and rules; only speed changes |
| CU Cousin | Green | Faster batch sending from a phone |
| PA Posting parent | Green | Bulk sends finish sooner; fewer "still sending" waits |
| FA Far-away inviter | Green | Relatives on weak signal see photos sooner |
| TR Tech reader | Red | A3 puts photo keys on the phone (in the keychain) |

Resolution: TR mitigation: A3 keeps only encrypted photo files on disk, keys in the phone keychain wiped at sign-out; privacy-security reviews it and `docs/architecture/03-encryption-and-keys.md` says so before it ships.
