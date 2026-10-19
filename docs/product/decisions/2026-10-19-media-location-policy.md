# Decision: location is a media policy value (strip | keep | extract), default strip
Date: Oct 19, 2026 · Status: Chase's · Source: Chase, Oct 19: "why do you recommend removing the location? I think we should build the infrastructure and make it configurable". Spec: `docs/product/SPEC-MEDIA.md` D2, MEDIA-5

| Persona | Green/Red | Why |
|---|---|---|
| PA Posting parent | Green | Default strip keeps A1; opens room for his location ideas later |
| FA Far-away inviter | Green | Nothing changes in setup or invites |
| LG Least-savvy grandparent | Green | Code-level only; no new setting or screen for her |
| AG Android grandpa | Green | Same cleaned file reaches every phone |
| SG Step or other-household grandparent | Green | No effect on who sees or replies |
| GG Great-grandparent who won't install | Green | Frame and email copies get the same stripped file |
| TR Tech reader | Red | "Location stripped" becomes a default, not a type guarantee; weaker claim |

Resolution: TR mitigation: MEDIA-5 test pins `location === 'strip'`; MEDIA-4/8 server refuse location while default strips; MEDIA-6 keeps code, doc and claims in step. Changing the default needs Chase's word, a new persona check and amends CLAUDE.md rule 2.
