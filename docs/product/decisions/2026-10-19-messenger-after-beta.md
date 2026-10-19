# Decision: a built-in messenger comes after the beta, encrypted on the family vault's keys, group and event chat first
Date: Oct 19, 2026 · Status: Chase's ("yes to both", Oct 19, to: park until after the beta alongside the vault; group and event chat before one-to-one) · Source: Chase, Oct 19: "I want a built in messenger. maybe we use signal". Tracker: D13

What "use Signal" can mean: Signal's own network has no API for other apps, so Hearth can't send through the Signal app. A "Message on Signal" link needs every relative to install Signal (fails "no help on old phones"). Signal's open library, libsignal (AGPL-3.0, like Hearth), works on our own US servers. MLS (RFC 9420, the IETF group-chat encryption standard; OpenMLS is MIT) is the other candidate and is built for groups. privacy-security picks between libsignal and MLS when the vault is designed, so both share one key system.

Rules carried forward: a conversation belongs to one group or event and reads its membership, so nobody messages someone they can't see (same as reply rules). No read receipts, typing dots or last-seen (A2). Both native libraries mean it can't run in Expo Go, so not before milestone 2.

| Persona | Green/Red | Why |
|---|---|---|
| PA Posting parent | Green | One place for photos and family talk, later; nothing changes now |
| FA Far-away inviter | Green | Chats follow groups they already set up; no extra setup |
| LG Least-savvy grandparent | Green | Nothing new before the beta; later no extra app to install |
| AG Android grandpa | Green | Built in, so no Android-only messaging gaps like group texts |
| SG Step or other-household grandparent | Green | Conversations follow groups, so no one sees other households |
| GG Great-grandparent who won't install | Green | No change; email and frame stay as they are |
| TR Tech reader | Green | Open, audited protocol, end to end encrypted, servers in the US |
