# Decision: AI positioning is option B: on-device only, opt-in. CF-10's "no ML of any kind" and the "no face scanning" claim are retired
Date: Oct 19, 2026 · Status: Chase's ("Yes I am", Oct 19, 17:36Z, asked "are you OK promising 'opt-in, on your phone only' instead of 'no AI at all'?") · Source: AI positioning session agenda (`ANCHORS.md`), TRACKER D6, `AI-FEATURES.md`, research page https://claude.ai/artifact/NsUEm6y7fVNQtjEVPjPUVn

| Persona | Green/Red | Why |
|---|---|---|
| GG Great-grandparent who won't install | Green | AI never runs on his phone or changes his view |
| LG Least-savvy grandparent | Green | Relatives never see AI settings; nothing new appears on their screens |
| AG Android grandpa | Green | No AI runs on relatives' phones, so old Androids carry no new load |
| SG Step or other-household grandparent | Red | Her face could be recognized on another household's phone without her say |
| CU Cousin | Green | Optional helpers; nothing counts or ranks who appears in photos |
| PA Posting parent | Green | Duplicate catch and audience suggestions cut bulk-upload work; always one tap to confirm |
| FA Far-away inviter | Green | Right photos reach far-away grandparents faster, and nothing sends without a tap |
| TR Tech reader | Red | Opt-in on-device AI is harder to verify than no ML at all |

Resolution: SG mitigation: the AI-1 phase 2 spec must include "Don't look for my face" for any adult, honored in every family, and suggestions only widen to groups the person is already in (AI-1 spec tests, named when specced).
Resolution: TR mitigation: AI-P0.1 adds a CI allowlist check for ML and vision libraries before any AI code lands, and AI-P0.7 writes the `docs/architecture/` AI section before the first add-on ships.
