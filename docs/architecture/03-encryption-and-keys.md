# 3. Encryption and key handling

What is encrypted, with which keys, and who can decrypt it. The short version: **photos are encrypted on the phone before upload, so the storage vendor holds only ciphertext, but Hearth's server holds the key that unlocks every photo key.** That is encryption at rest with server-held keys, not end-to-end encryption.

## What is encrypted

| Data | At rest | In transit | Who can read it |
|---|---|---|---|
| Photo bytes (display and thumbnail) | AES-256-GCM, per-item key, encrypted on the phone | TLS | The family members the post is shared with, and Hearth's server (via `MEDIA_KEK`) |
| Per-item keys | Wrapped with AES-KW under `MEDIA_KEK`, in a table no client can read | TLS | Hearth's server |
| Captions, comments, names, groups, emails | Plaintext columns; disk-level encryption by Supabase | TLS | Hearth's server and Supabase |
| Chat messages | MLS (RFC 9420), sealed on the phone; history on each phone, AES-256-GCM at rest | TLS | Only the people in the chat ([06-messenger.md](06-messenger.md)) |
| Notices | Not stored after sending | TLS | Resend, Expo, Apple, Google (display names and counts only) |

## Media format: `aes-256-gcm-chunked-v1` (Built)

Defined in `app/src/crypto/media.ts`. The AES-GCM itself comes from the fastest provider the runtime has (`app/src/crypto/aesGcm.ts`, DEC-29): a native module once the app runs in its own build (Planned: registered at start-up, not installed yet), the browser's `crypto.subtle` on the web build (Built), and `@noble/ciphers` in JavaScript in Expo Go, which has neither (Built). All three produce the same bytes; tests check each against a NIST known-answer vector and against each other.

- Plaintext is split into 64 KiB chunks. Each chunk is sealed with AES-256-GCM and stored as `nonce (12 bytes) ‖ ciphertext ‖ tag (16 bytes)`.
- The nonce is `file prefix (7 random bytes per file) ‖ chunk index (4 bytes, big-endian) ‖ last flag (1 byte)`. Binding the index and the last-chunk flag into the nonce means reordering, dropping or truncating chunks fails authentication (the STREAM construction).
- Each media item gets its own key, shared only by its display and thumbnail versions, which get different random file prefixes.
- All keys, nonces and prefixes come from `app/src/crypto/random.ts`, which uses only the platform's secure `getRandomValues` and throws if it is missing. Before 2026-10-19 it used expo-crypto's `getRandomBytes`, which falls back to `Math.random` in development builds such as Expo Go; milestone 1 photos encrypted before that fix should be treated as test data only (MS4).
- The backend never decrypts media. Only clients need to agree on the format, and the scheme name is stored per item (`media_items.enc_scheme`) so it can change later.

## Key hierarchy (Built)

```
MEDIA_KEK  (256-bit, Edge Function secret only; one for the whole service)
  └─ wraps (AES-KW) ─ per-item data key  (256-bit AES-GCM, one per photo)
                        └─ encrypts ─ display and thumbnail objects in B2
```

- **Minting.** On upload, `sign-media` generates a data key with WebCrypto, wraps it under `MEDIA_KEK`, stores the wrapped key in `media_keys` (`kek_version` recorded), and returns the raw key to the uploader over TLS (`backend/supabase/functions/sign-media/index.ts`).
- **Release.** On view, `sign-media` checks `can_view_post` as the caller, then unwraps and returns the key with 10-minute download URLs. A caller without access gets `404`, never a key.
- **Ready needs the key.** A photo is marked ready only if its wrapped key was saved; otherwise it's marked failed and the app uploads it again, so a post never publishes with a photo nobody can decrypt (`mark_media_upload_result`, migration 0012, S15).
- **Storage.** `media_keys` has RLS on and no client policy; select is revoked from signed-in users. Only the service role reads it.
- **On the phone** (A3, DEC-29, Built 2026-10-21). Decrypted bytes stay in memory; nothing decrypted is written to disk except an explicit "Save to my phone". To make Photos open instantly and offline, the app keeps the *ciphertext* of photos it has shown in its cache folder (`hearth-media/<media_id>.<thumb|display>`, `app/src/platform/mediaStore.ts`), at most 400 files, oldest dropped first. The matching item keys are kept in one map per signed-in person, sealed with AES-256-GCM under a 32-byte key that lives only in the iOS Keychain or Android Keystore (`secureSessionStorage`, the same store as the sign-in session). A copied cache folder is unreadable without that keychain entry. When a refresh shows a post is gone or no longer shared with you, its files and keys are dropped (`MediaCache.prune`); signing out wipes both (`clearDisk`). The web build keeps nothing. Gap: a phone that is unlocked and in someone else's hands shows the kept photos, the same as the app itself would.
- **Deletion.** Deleting a post deletes its wrapped keys, which makes its objects unreadable even before B2 removes them (crypto-shredding per post).
- **Backup.** `MEDIA_KEK` is printed and kept in two offline places. Losing it loses every photo.

## What this protects, and what it doesn't

**Protects against:** a breach or insider at the storage vendor; a leaked bucket listing or URL after it expires; tampering with stored objects (GCM authenticates every chunk).

**Doesn't protect against:** anyone who controls Hearth's server or its secrets, since they can unwrap any key; a compelled disclosure to Hearth; captions and comments, which are not encrypted at the application layer. See [04-threat-model.md](04-threat-model.md).

**Gaps.** One KEK for all families, so there is no per-family crypto-shredding; `kek_version` exists but no rotation procedure is written; deleted rows (with wrapped keys) persist in database backups for the backup window.

## Roadmap (Planned)

Each step makes one more claim true. Order and status live in `docs/product/MARKETING.md` "Privacy-first path" and the tracker.

1. **Per-family media keys** (tracker D8). A key per family space sits between `MEDIA_KEK` and the item keys. Deleting a family destroys its key, so its photos are unreadable even in backups.
2. **Encrypt captions and replies** with the same hierarchy. Costs server-side caption search.
3. **KEK rotation** using `kek_version`.
4. **The family vault** (post-beta, opt-in). Keys live only on family devices, with a printed recovery card; Hearth's server can no longer decrypt. This is the only step that would make "end-to-end encrypted" true.

---
Last checked against code: 2026-10-21, A3 kept ciphertext files and keychain-sealed keys (media/cache.ts, platform/mediaStore.ts) and A1 AES-GCM providers (crypto/aesGcm.ts); earlier 2026-10-19, MS4 randomness fix (plus migration 0015: chat messages under MLS)
