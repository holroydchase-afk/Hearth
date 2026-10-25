# Decision: Love, Haha, Like and Comment as icons only on each moment (REACT-1..9)
Date: Oct 25, 2026 · Status: Chase's call ("I want the love, haha, like, comment. Just emojis/icons, no label"), built in a draft PR · Touches MOMENT-3, BETA-REPLY-1, DS-3, CLAUDE.md rule 3, AUD-8

**What changes.** The card's action row becomes four icons with no words under them: ❤️ Love, 😂 Haha, 👍 Like and 💬 Comment. Each keeps its spoken label ("Love it", "Haha", "Like it", "Write a comment") and a 48 pt target. One reaction per person per post: tapping the same one takes it back, tapping another switches. The line above the row counts each kind, most first ("😂 2   ❤️ 1"), and a screen reader hears "2 haha, 1 love". Server: migration 0017 adds `set_reaction` and `reaction_summary`; `toggle_heart` and the feed's heart fields stay, so older app builds keep working, and an app on a server without 0017 treats every reaction as a heart.

| Persona | Green/Red | Why |
|---|---|---|
| GG Great-grandparent who won't install | Green | Doesn't use the app; email notices unchanged |
| LG Least-savvy grandparent | Red | No words under icons; 😂 and 👍 need guessing |
| AG Android grandpa | Green | Emoji look the same on Android; 48 pt targets |
| SG Step or other-household grandparent | Green | Same reply rules decide who sees each reaction |
| CU Cousin | Green | Matches Facebook and iMessage reactions they already use |
| PA Posting parent | Green | Sees which kind each relative chose, not just a count |
| FA Far-away inviter | Red | Can't say "tap the one that says Love" over the phone |
| TR Tech reader | Green | Same table and reply rules; no new data kept |

Resolution: LG Chase override (Oct 25, 2026): he chose icons with no labels; screen readers still hear each name, and the emoji are the ones relatives already know from texting. Check in the next UAT session.
Resolution: FA Chase override (Oct 25, 2026): the inviter can say "tap the red heart"; the emoji are distinct by colour and shape.
