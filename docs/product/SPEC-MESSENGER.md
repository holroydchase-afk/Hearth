# Messenger: group and event chat, end to end encrypted with MLS

Owner: staff-pm · Source: Chase, Oct 19: "I want a built in messenger. maybe we use signal", then "Build the messenger now alongside anything else in motion. Use the MLS" · Decision: `decisions/2026-10-19-messenger-mls.md` (tracker D13).

## What it is
Every group and event has a **Messages** page. Only the people in that group read it. Messages are end to end encrypted with **MLS** (Messaging Layer Security, RFC 9420), the IETF standard for encrypted group chat. Hearth's servers relay sealed messages and never hold the keys.

- **Library:** `ts-mls` 1.6.4 (MIT, pure TypeScript). Its built-in crypto needs WebCrypto, which Expo Go (Hermes) lacks, so Hearth adds its own ciphersuite on the audited `@noble` libraries (`packages/messenger/src/crypto.ts`, the shared library `@holroyd/messenger` since Oct 26, DEC-39). Suite: `MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519`. Tests check it against ts-mls's WebCrypto pieces in both directions.
- **Server:** relays only. It stores sealed message bodies, public key packages and each person's public signing key, plus who sent what to which group and when (metadata, see Limits).
- **History lives on the phone.** MLS gives forward secrecy, so a message can't be decrypted again later. Each phone keeps its own copy, encrypted at rest (the `secureSession` pattern). A new phone starts with an empty history.

## Rules
- A conversation belongs to one group or event (any circle kind but household) and follows its membership, **plus the family's parents** (owner and adults), the same as "parents read every reply" (REPLY-10). People only message people they already share that group with.
- A relative sees a plain group's chat titled by its people ("Alex and Grandpa Rivera"), never by the group's name (AUD-14). Parents see group names; events keep their name (EVT-1).
- Joining the group lets you read messages sent **after** you were let in. Leaving or being removed stops your access at once (server) and at the next key change (MLS).
- No read receipts, no typing dots, no last-seen, no "delivered" (A2 Guilt-free).
- Words under every button. Text 17pt+, 48pt tap targets (CLAUDE.md rule 3).

## Acceptance criteria
| ID | Type | Pri | Criterion |
|---|---|---|---|
| MSG-1 | auto | P0 | **Given** two people in a group, **When** one sends "Hi Bebar", **Then** the other reads "Hi Bebar", and no stored row on the server contains the words. |
| MSG-2 | auto | P0 | **Given** someone not in the group, **When** they fetch, send, claim keys or read the roster for it, **Then** each is refused as "not found" (P0002) and nothing comes back. |
| MSG-3 | auto | P0 | **Given** a person removed from the group, **When** the others send afterwards, **Then** the server returns them nothing new and the next key change removes them, so the new messages are unreadable to them even with a copy of the rows. |
| MSG-4 | auto | P0 | **Given** a phone with no WebCrypto (Expo Go), **When** a group is made and messages flow, **Then** it works, and Hearth's ciphersuite interoperates with the reference in both directions. |
| MSG-5 | auto | P0 | **Given** two phones changing the group's keys at the same moment, **When** both send, **Then** exactly one wins (23505 for the other), the loser catches up and retries, and the group never splits. |
| MSG-6 | auto | P0 | **Given** a welcome for a new member, **When** anyone else fetches, **Then** only that member sees it. |
| MSG-7 | auto | P1 | **Given** an event, **When** its people chat, **Then** it works exactly like a group (MSG-1..3). |
| MSG-8 | auto | P1 | **Given** a person who signs in on a new phone, **When** someone in the group next opens Messages, **Then** the old phone is removed from the group and the new one is let in. |
| MSG-9 | manual | P1 | **Given** Chase in Expo Go and account B on the web, **When** they open Messages on a shared group and trade 5 messages each way, **Then** all arrive in order within 10 s of opening or refreshing, and the screen meets the rules above. |

## Limits for now (white-paper honest)
- **One phone per person.** Signing in on a second device replaces the first for chat (MSG-8).
- **No safety numbers yet.** The server hands out key packages, so a malicious server could add a hidden device. Key verification (comparing codes in person) is the fix; privacy-security owns it.
- **Metadata:** the server sees who sent a message to which group and when, and message sizes (MLS pads them).
- **No push for messages yet.** You see new messages when Messages is open or refreshed (push arrives with milestone 2).
- **Text only.** Photos keep going through posts.
- **Someone has to open Messages to let a newcomer in** (only members' phones can add people; the server can't).
