# 6. Messenger: group chat with MLS

Every group and event in a family space has a chat. Messages are end-to-end encrypted with **MLS** (Messaging Layer Security, [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420)): only the phones in the chat hold the keys, and Hearth's server relays sealed bytes it cannot open. Spec: `docs/product/SPEC-MESSENGER.md`.

## Pieces (Built)

| Piece | What it does | Code |
|---|---|---|
| MLS library | `ts-mls` 1.6.4 (MIT, pure TypeScript): groups, key changes ("commits"), welcomes, application messages | `app/package.json` |
| Ciphersuite | `MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519` (suite 3), built on the audited `@noble` libraries because Expo Go (Hermes) has no WebCrypto. HPKE ([RFC 9180](https://www.rfc-editor.org/rfc/rfc9180)) base mode, HKDF/HMAC-SHA256, X25519, Ed25519, ChaCha20-Poly1305. Tests interoperate both ways with ts-mls's WebCrypto pieces (`@hpke/core`) | `app/src/messenger/mlsCrypto.ts` |
| Phone client | Keeps this phone's signing key, key packages, each group's MLS state and the message history; joins, sends, applies key changes, adds and removes people | `app/src/messenger/client.ts` |
| Relay | Six RPCs over four RPC-only tables; stores opaque base64 MLS bytes | `backend/supabase/migrations/0015_messenger.sql` |
| Screen | Messages, opened from a button at the top of Photos | `app/src/screens/MessagesScreen.tsx` |

## Who is in a chat (Built)

A chat's people are the group's members plus the family's parents (owner and adults), the same rule as "parents read every reply" ([05-access-control.md](05-access-control.md)). Households have no chat. The server enforces this on every call (`private.chat_people`); anyone else gets "not found" (`P0002`), the same answer as for a chat that doesn't exist. A relative sees a plain group's chat titled by its people, never by the group's name.

The server decides who *may* be in the chat; the phones decide who *is* in the MLS group. When anyone opens a chat, their phone compares the group's MLS members with the server's roster and commits the difference: it removes people who left the group or changed phones, and adds people who are new, using one-use key packages from the server.

## How a message moves (Built)

1. **First visit.** The phone makes an Ed25519 signing key and 10 key packages, keeps the private halves, and publishes the public halves (`chat_publish_device`). It tops up when fewer than 3 are left.
2. **Starting.** The first person to open a chat creates the MLS group on their phone (`chat_start` records that it exists). Everyone else waits for a welcome.
3. **Letting someone in.** A member's phone claims a key package for each new person (`chat_claim`, one use each), checks it names that person and the signing key the roster shows, commits the change, and posts the commit plus one welcome per new person (`chat_send`). Only the named person can fetch their welcome.
4. **Sending.** The phone encrypts with the group's current epoch keys and posts the sealed message. It keeps its own copy: MLS senders can't decrypt their own messages later.
5. **Reading.** `chat_fetch` returns rows in order, only those created since the reader joined. The phone applies key changes in epoch order and decrypts messages into its local history.

**Ordering.** The server accepts one commit per epoch (unique index), so two phones changing keys at the same moment can't split the group: the loser gets `23505`, catches up and retries.

## What is stored where

| Data | Where | Who can read it |
|---|---|---|
| Message text | Only on the phones in the chat, in the local history, encrypted at rest (AES-256-GCM, key in the Keychain/Keystore) | The people in the chat |
| MLS group state and private keys | Same, per phone | That phone |
| Sealed messages, commits, welcomes | `chat_messages` (base64), kept indefinitely for now | Nobody can open them without a member's keys |
| Public signing key, key packages | `chat_devices`, `chat_key_packages` | Hearth's server (public material) |
| Who sent a row to which chat, when, its kind, epoch and size | `chat_messages` | **Hearth's server** (metadata) |

## Guarantees and limits

- **Built: the server can't read messages.** No server key opens them; the relay only checks membership, kind, epoch and base64 shape.
- **Built: forward secrecy and post-compromise security** come from MLS. Someone removed from the group can't read later messages, even with a copy of the rows (tested: MSG-3).
- **Gap: no key verification.** The server hands out key packages and signing keys, so a malicious or compromised server could add a hidden phone to a chat. The fix is safety numbers compared in person (Planned, privacy-security).
- **Gap: metadata.** The server sees who posts to which chat, when, and roughly how much.
- **Gap: one phone per person.** A new phone replaces the old one at the next key change; history doesn't move to the new phone.
- **Gap: someone must open Messages to let a newcomer in.** Only members' phones can add people.
- **Gap: no push for messages** until milestone 2; the screen checks every 10 seconds while open.
- **Gap: no outside review** of the ciphersuite code. It is small and interop-tested against a reference, but it is our own glue around audited primitives.

---
Last checked against code: 2026-10-19, a522a3a (migration 0015)
