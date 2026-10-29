# Plan: the family vault (end-to-end encrypted groups with MLS)

Status: plan only, Oct 29, 2026 (Chase: "I also want a plan for 2. One I can break down over the course of days. Also include the family vault work"). Owner: staff-pm; privacy-security owns the design, architect owns any new dependency. Nothing here is built or decided past DEC-16 and DEC-35. Each day below is one PR, sized for one night-shift run, and every build day starts with its failing test (rule 1).

## What it is, in one paragraph

Today Hearth encrypts each photo on the phone, but the server holds `MEDIA_KEK`, which unlocks every photo key ([03-encryption-and-keys.md](../architecture/03-encryption-and-keys.md)). The vault moves the keys onto family phones. Each Hearth group (Everyone, a side, an event) becomes an MLS group, the same machinery the messenger already uses ([06-messenger.md](../architecture/06-messenger.md)). A photo's key is sealed with a secret only that group's phones can derive, so Hearth's server stores sealed bytes it cannot open. That is the one change that makes "end-to-end encrypted" and "not even we can see your photos" true (MARKETING claims register row 40).

## MLS in plain words

**What it is.** MLS (Messaging Layer Security) is the IETF's standard for end-to-end encrypted group chat, published as RFC 9420 in July 2023. It was designed by people from the Signal, Wire, Cisco, Mozilla and academic worlds to fix Signal's weak spot: Signal-style groups get slow and expensive as they grow, because every sender encrypts to each member separately.

**How it works.**
- **A tree of keys (TreeKEM).** Every member is a leaf on a binary tree. Each branch holds a key known only to the leaves under it, and the root's key is the group's secret. Changing one person's keys only touches the branches above them, so adding or removing someone costs about log₂(n) work instead of n. For a 40-person family that's roughly 6 encryptions instead of 40.
- **Epochs.** The group moves forward in numbered steps. Every add, remove or key refresh is a *commit* that starts a new epoch with fresh keys.
- **Key packages.** Each phone publishes one-use public keys ahead of time, so others can add it while it's offline. Hearth's relay already stores these (`chat_key_packages`).
- **Welcomes.** A new member gets a sealed welcome holding the current epoch's secrets, and nothing from before.
- **Exporter secrets.** Each epoch can produce extra labeled secrets for uses beyond chat. This is the hook the vault uses for photo keys.

**What it guarantees.**
- **Forward secrecy:** someone who steals today's keys can't read last month's posts.
- **Post-compromise security:** after a stolen phone is removed, or its keys are refreshed, the thief can't read new posts.
- **Removal is real:** someone removed from a group can't read anything posted after that, even with copies of every server row (already tested for chat: MSG-3).

**Who uses it** (from memory, not checked this session): Wire, Cisco Webex, Discord's end-to-end encrypted calls (its DAVE protocol), and the GSMA's encrypted RCS standard that Google Messages and Apple are adopting. Check each against the vendor's page before any marketing line uses it (MARKETING.md).

**What Hearth already has (Built, Oct 19).** The messenger runs MLS on every phone: `ts-mls` 1.6.4 with ciphersuite 3 (X25519, ChaCha20-Poly1305, Ed25519) over the audited `@noble` libraries, so it works in Expo Go. There's a six-RPC relay (migration 0015) and the shared library from PR #57. One chat already exists per group and event, which is the exact shape the vault needs.

**Known gaps the vault inherits** (06-messenger.md):
1. No safety numbers, so a compromised server could slip a hidden phone into a group.
2. Metadata is visible: who posted to which group, when, and roughly how big.
3. One phone per person, with no history moved to a new phone.
4. Someone must open the app to let a newcomer in.
5. About 170 lines of our own crypto glue (`mlsCrypto.ts`) that has had no outside audit.

## What the family gives up (why it's opt-in and paid, DEC-16)

- **A lost phone with no recovery card means lost photos.** Hearth can't recover them.
- **No server-side caption search.** Search moves onto the phone.
- **Email digests and a future web viewer can't show photos.** They can still say "new photos from Chase".
- **New members see past photos only if a member's phone re-shares those keys** (day 8).
- The vault is not an AI feature, so it sits on its own "vault" plan, separate from the AI subscription (DEC-37).

## The plan, one PR per day

| Day | Step | Lane | Why it's in this order | Chase needed? |
|---|---|---|---|---|
| 1 | **Decision and threat model.** Persona check, a DEC entry, a vault section in `04-threat-model.md`. Two calls for Chase: vault per family or per group (pick: per family), and printed recovery card yes/no (pick: yes) | staff-pm, privacy-security | Locks scope before code | Two one-word answers |
| 2 | **Per-family media keys (D8).** A key per family between `MEDIA_KEK` and item keys; deleting a family shreds its photos even in backups | engineer after qa-tdd | Helps every family now and gives the vault a clean switch point | Say "deploy" for the migration |
| 3 | **Safety numbers in Messages.** Two phones show the same 12 words or a QR to compare in person. Closes gap 1 for chat and vault at once | privacy-security, grandparent-ux words, engineer | The vault is only as honest as key verification | No |
| 4 | **Vault key library.** In `packages/messenger`: `postKey = MLS-Exporter("hearth-vault-post", post_id, 32)` per epoch, seal and unseal item keys, test vectors on web and Expo Go | qa-tdd, engineer | Pure code, no server, easy to test | No |
| 5 | **Server tables.** `vault_post_keys` (sealed blob, group, epoch), RPC-only, "not found" for outsiders; `families.vault_enabled` flag, off | architect, engineer | Schema before app paths; contract tests change first (API.md) | Say "deploy" |
| 6 | **Posting in a vault family.** The phone mints the item key itself, seals it under the group's post key, and `sign-media` never sees it | engineer | Upload first, so new photos are vault photos | No |
| 7 | **Viewing.** The phone derives the key from its MLS state; a missing key shows "Ask Chase to open Hearth" instead of a broken photo | engineer, grandparent-ux | The other half of the loop; now demoable | No |
| 8 | **Joining and past photos.** A member's phone re-seals older post keys for a newcomer, following the share-history choice (Share all past photos or Only new photos) | privacy-security, engineer | MLS hides old epochs by design, so history needs an explicit handoff | No |
| 9 | **Recovery card and a second phone.** A printed card of words restores this person's keys onto a new phone; adding a second phone works the same way. Closes gap 3 | privacy-security, grandparent-ux | Without this, a dropped phone loses photos (A1) | Print one test card |
| 10 | **Words get encrypted.** Titles, captions and comments sealed under the post key; caption search runs on the phone | engineer | Finishes "Hearth can't read it" (CAP-D3) | No |
| 11 | **Turning it on.** Owner-only "Lock this family" flow, a lock on vault posts, phone-to-phone add by QR ("like handing over a house key") | grandparent-ux, engineer | UX last, once the plumbing is real | Review the screens |
| 12 | **Paid gate.** `can(space, 'vault')` checks the vault plan; free families keep today's encryption | engineer | Monetization rule; trivial once the flag exists | No |
| 13 | **Harden.** privacy-security review of days 2–12, rewrite `03` and `06` architecture docs, write the outside-audit ask for `mlsCrypto.ts` (cost decided at milestone 7) | privacy-security, qa-tdd | The white paper (A4) and the audit scope | No |
| 14 | **UAT.** Chase and a test account run the vault for two days: post, view offline, remove a member, recover with the card | Chase, qa-tdd | Proves it on phones (rule 8) | Yes, the 2-day run |

**Claims flip only after day 14.** MARKETING's "end-to-end encrypted" row moves to *True* only once UAT passes, and "audited" waits for the outside review.

**Not in this plan:** hiding metadata (gap 2; needs private-retrieval techniques, a research project of its own), and a web viewer for vault families.

## When

DEC-16 says after the beta. Days 2 and 3 help everyone and could start sooner if Chase pulls them forward. Days 4–14 wait for the beta unless Chase says otherwise. The photo frame (SPEC-PHOTO-FRAME.md) reads the phone's decrypted cache, so it keeps working in a vault family with no changes.
