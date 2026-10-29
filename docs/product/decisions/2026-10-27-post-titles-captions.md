# Decision: an optional title and caption for each set of photos (CAP-*)
Date: Oct 27, 2026 · Status: decided Oct 28 (DEC-39), not built yet · Source: Chase, Oct 27 ("a social media type post describing the set of pictures, similar to Instagram and Facebook"). Spec: `docs/product/SPEC-CAPTIONS.md`. Touches MOMENT-1..8, BETA-SHARE-1, BETA-REPLY-4, BETA-NOTIFY-2

**Proposal.** One optional title (80 characters) and the existing optional caption (2,000) for the whole set, shown at the top of the moment card, long captions folded behind **Read more**, and the sender can change the words later from **More**. No per-photo captions, mentions, hashtags, links or AI help.

| Persona | Green/Red | Why |
|---|---|---|
| GG Great-grandparent who won't install | Green | Email and web link unchanged; notices still carry no words |
| LG Least-savvy grandparent | Red | One more box on Share; might think a title is required |
| AG Android grandpa | Green | Plain labeled boxes and worded Read more, 48 pt targets |
| SG Step or other-household grandparent | Green | Same card for everyone; words follow the post's audience |
| CU Cousin | Green | Reads like an Instagram or Facebook post |
| PA Posting parent | Green | Names the set once, fixes typos without losing comments |
| FA Far-away inviter | Green | "Type a name in the Title box, or skip it" is easy to coach |
| TR Tech reader | Red | Titles are another plaintext field Hearth's server can read |

Resolution: LG mitigation: both boxes say "(optional)", Post never waits for words and nothing prompts for them (CAP-R1); grandparent-ux checks the Share screen with Bigger text before any build, and the next UAT session watches Bebar or Gigi post with no words.
Resolution: TR mitigation: the title is stated as plaintext in 03-encryption-and-keys and the threat model in the build PR, kept out of every notice and log (CAP-R3, CAP-10), and encrypted with captions when the family vault lands (CAP-D3).
