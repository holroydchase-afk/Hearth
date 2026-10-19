# Decision: build the messenger now, on MLS, group and event chat first
Date: Oct 19, 2026 · Status: Chase's. First "yes to both" (park until after the beta; group and event chat first), then changed the same night: "Build the messenger now alongside anything else in motion. Use the MLS" · Source: Chase, Oct 19: "I want a built in messenger. maybe we use signal". Tracker: D13 · Spec: `SPEC-MESSENGER.md`

What "use Signal" can mean: Signal's own network has no API for other apps, so Hearth can't send through the Signal app. A "Message on Signal" link needs every relative to install Signal (fails "no help on old phones"). Signal's open library, libsignal (AGPL-3.0, like Hearth), works on our own US servers. MLS (RFC 9420, the IETF group-chat encryption standard; OpenMLS is MIT) is the other candidate and is built for groups. Chase picked MLS: it is built for groups, removing someone is cheap, and the same group keys can later protect the family vault. Library: ts-mls (pure TypeScript) with Hearth's own noble-only crypto so it runs in Expo Go.

Rules carried forward: a conversation belongs to one group or event and reads its membership, so nobody messages someone they can't see (same as reply rules). No read receipts, typing dots or last-seen (A2). Staff-pm note: this widens milestone 1 against the Oct 17 laser focus; Chase chose it knowingly, and it ships behind a Messages button so the photo demo is untouched.

| Persona | Green/Red | Why |
|---|---|---|
| PA Posting parent | Green | Photos and family talk in one place, encrypted |
| FA Far-away inviter | Green | Chats follow groups they already set up; no extra setup |
| LG Least-savvy grandparent | Green | No extra app; one labeled Messages button per group |
| AG Android grandpa | Green | Built in, so no Android-only messaging gaps like group texts |
| SG Step or other-household grandparent | Green | Conversations follow groups, so no one sees other households |
| GG Great-grandparent who won't install | Green | Nothing changes for email or frame; chat is optional |
| TR Tech reader | Green | Open, audited protocol, end to end encrypted, servers in the US |
