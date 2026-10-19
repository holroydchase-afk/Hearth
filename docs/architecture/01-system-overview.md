# 1. System overview

Hearth is a private photo app for families. Every post has an explicit audience (a set of groups), and the server enforces that audience on every read. This section names the components, the vendors behind them, and what each one can see.

## Design goals

| Goal | How the architecture serves it |
|---|---|
| A post you can't see doesn't exist for you | Access is enforced in Postgres row-level security (RLS) and in the one function that hands out media URLs. Not-allowed and not-found return the same answer |
| Photos are never readable by a storage vendor | Media is encrypted on the phone before upload; the bucket holds only ciphertext |
| Minimal metadata | Location and camera data are stripped on the phone; no analytics, ad or crash SDKs; notices carry no photo, caption or comment text |
| Data stored in the US | Database and media live in US regions (see residency gaps below) |
| No AI on family media | No component sends media or metadata to any model or analytics service |

## Components

| Component | What it is | Code |
|---|---|---|
| App | Expo (React Native, TypeScript strict) for iPhone, Android and web. Holds the media pipeline, encryption and upload queue | `app/` |
| API contract | `HearthApi` interface with a Supabase implementation and a fake for tests | `app/src/api/`, `docs/eng/API.md` |
| Database | Supabase Postgres. All tables have RLS; clients call a small set of RPCs | `backend/supabase/migrations/` |
| Sign-in | Supabase Auth, email one-time code (6 digits) sent over Resend SMTP | Supabase dashboard; `deploy/` templates |
| `sign-media` | Edge Function (Deno). The only path for media bytes in or out of storage: checks permission, mints and unwraps keys, presigns URLs | `backend/supabase/functions/sign-media/` |
| `notify` | Edge Function (Deno), run every minute by `pg_cron`. Drains the notification outbox to Expo Push and Resend | `backend/supabase/functions/notify/` |
| Media storage | Backblaze B2 (S3-compatible), region `us-east-005`. Stores encrypted display and thumbnail objects | env in `sign-media/index.ts` |
| Messenger | MLS (RFC 9420) group chat; the server relays sealed bytes only. See [06-messenger.md](06-messenger.md) | `app/src/messenger/`, `migrations/0015_messenger.sql` |
| Error reports | Our own table, fixed-shape fields only, kept 30 days; no third-party SDK | `migrations/0006_client_errors.sql` |

## Vendors and what they can read

| Vendor | Role | Can read | Cannot read |
|---|---|---|---|
| Supabase | Database, auth, functions | Everything Hearth's server can (see below); auth logs with email and IP | Photo bytes (they live in B2 as ciphertext) |
| Backblaze B2 | Media storage | Ciphertext, object sizes, upload and download times, requester IPs | Photo contents, captions, names |
| Resend | Email delivery | Recipient email, sender display name, counts, a link | Photos, captions, comment text |
| Expo, Apple, Google | Push delivery (milestone 2) | Device push token, sender display name, counts, a post id | Photos, captions, comment text |

**What Hearth's own server can read today (Built):** names, email addresses, group membership, captions, comment text, timestamps, and, through `MEDIA_KEK`, every photo's key. Photos are encrypted at rest, but Hearth holds the keys. See [03-encryption-and-keys.md](03-encryption-and-keys.md).

## Residency

**Built:** the database runs in Supabase East US; media in Backblaze US East.

**Gap:** "stored in the US" is true; "never leaves the US" is not yet. Supabase logs and telemetry are stored outside the US, its support staff are global, and its contracting entity is in Singapore (`docs/eng/research.md` §4). Push notices transit Apple and Google networks. Closing this means self-hosted auth and Postgres on US infrastructure, a post-proof-of-concept item (anchor A3).

---
Last checked against code: 2026-10-19, a522a3a (messenger, migration 0015)
