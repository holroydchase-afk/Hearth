# Decision: Live Photos store the still, the video and a Hearth pairing ID from day one
Date: Oct 19, 2026 · Status: Chase's · Source: Chase, Oct 19: "can we display them as regular live photos once we have the apple developer license? I don't want to work we will undo." Spec: `docs/product/SPEC-MEDIA.md` §3, LIVE-*

| Persona | Green/Red | Why |
|---|---|---|
| PA Posting parent | Green | Nothing built is thrown away when the dev build arrives |
| FA Far-away inviter | Green | No effect on setup |
| LG Least-savvy grandparent | Green | A worded "Play" button, never press-and-hold only (LIVE-4, LIVE-5) |
| AG Android grandpa | Red | Spec said Android gets the still only; iPhone relatives get motion |
| SG Step or other-household grandparent | Green | Same post for every household |
| GG Great-grandparent who won't install | Green | Frame and email get the still, as today |
| TR Tech reader | Green | Pairing ID is new and random; Apple's content ID never stored |

Resolution: AG mitigation: Android plays the stored video with the same "Play" button (Hearth's player); only Apple's native Live view is iPhone-only. LIVE-7 rewritten.
