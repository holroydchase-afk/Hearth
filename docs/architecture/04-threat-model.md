# 4. Threat model

What Hearth defends, against whom, and where the defense stops today. Written to be read by someone deciding whether to trust Hearth with their children's photos. Status labels follow [README.md](README.md): **Built**, **Planned**, **Gap**.

## Assets

1. Photos of children, and their capture dates.
2. Who is in the family and how it is split (sides, households, who sees whom).
3. Words: captions, comments, names.
4. Behavior: who opened what, when, from where.
5. Account identifiers: emails, push tokens, IP addresses.

## Adversaries and defenses

| Adversary | Goal | Defense | Status |
|---|---|---|---|
| **A relative outside a post's audience** | See a post, or learn it exists | RLS on every table; one visibility predicate (`private.sees_post`) behind RLS, the feed, `sign-media` and notices; not-allowed returns the same `404` as not-found | Built. By design, parents see every post in their family space |
| **A relative inside the family** | Learn whether another relative looks at posts | No last-seen, login or activity details shown (migration 0004); notices carry no viewing data | Built, except "Seen by N of M" on your own posts (anchor A2 conflict, tracker D4) |
| **A former member** | Keep access after removal | Access is checked at request time; download URLs expire in 10 minutes; photos kept for offline viewing (A3) are dropped at the next refresh that no longer lists the post | Built. **Gap:** photos already saved to their phone stay there; a phone kept offline still shows photos it had kept until it next refreshes |
| **Someone with a leaked link** | Download photos | Presigned URLs expire in 10 minutes and return ciphertext only | Built |
| **Someone with a forwarded or logged invite link** | Join the family as a relative | Invites are single-use, expire in at most 30 days and can be addressed to one email; the link token is 160 random bits and the typed code is rate limited (S10). Links point at the hosted web build, not at `hearth.family`, which isn't bought: whoever registered it would have received live tokens (migration 0014; `backend/scripts/smoke-check.sh` fails if hosted points there again) | Built. **Gap:** the token sits in the URL path, so the web host's request logs can hold it until it's used or expires; ONB-6 (milestone 2) moves it after `#`. Expo's EAS Hosting is the web host; where it keeps logs is not yet written down |
| **Storage vendor (B2) breach or insider** | Read photos | Phone-side AES-256-GCM; B2 never sees a key | Built |
| **Location stalker** | Find a child's home or school from a photo | EXIF and GPS stripped on the phone by a code-level media policy (location default `strip`), verified on the output bytes, enforced by a database check; video posting off until it can be stripped too | Built (photos) |
| **Ad, analytics or AI vendor** | Profile the family | None are present: no analytics, ad or crash SDKs; error reports are our own fixed-shape table, 30-day retention | Built |
| **Push and email providers** | Learn content | Notices carry display names, counts and a link only | Built. **Planned:** names-off setting (D9) |
| **Account takeover** | Sign in as a relative | One-time email codes, 1-hour expiry; no passwords to reuse | Built. **Gap:** an inbox compromise is an account compromise; SIM-swap risk if text codes ship (D11) |
| **Hearth's operator, or whoever compromises Hearth's server** | Read everything | Least-privilege grants, keys only in function secrets, no keys or captions in logs | **Gap:** the server can unwrap every photo key and read all captions and comments. Fixed only by the family vault |
| **Anyone who reads Hearth's database or function logs** (operator, breach, legal demand) | Learn where relatives are, or match accounts to addresses | Hearth's own tables keep no IP address: the invite rate limit (S10) stores a keyed HMAC of the address, cleared daily, and the key (pepper) is replaced daily so a dump or backup can't reverse older hashes (migration 0012, `backend/tests/privacy_audit_test.sql`). No `console.*` call in the app or the edge functions logs a key, URL, caption, email or raw error; CI enforces it (`scripts/check-logs.mjs`) | Built. **Gap:** Supabase's own logs sit outside our code and can hold IP addresses. On the Free plan Supabase lists 1 day of API and database log retention and 1 hour of Auth audit logs (supabase.com/pricing and docs/guides/auth/audit-logs, checked Oct 18, 2026); paid plans keep them longer. Supabase Auth can also write its audit log, with an IP address field, into `auth.audit_log_entries` in our own database; `backend/scripts/smoke-check.sh` counts those rows (never printing them) and warns. Supabase backups and point-in-time restore keep database rows (including hashed rate-limit keys) for their own retention window, not yet written down |
| **Legal demand to Hearth or Supabase** | Obtain family data | Data minimization; US storage | **Gap:** what's readable by the server can be produced. Supabase contracts through a Singapore entity |

## Out of scope (today)

- A compromised phone (malware, an unlocked device in someone else's hands).
- Screenshots or saved copies made by a legitimate viewer.
- Traffic analysis by network observers (timing and sizes of encrypted transfers).
- Denial of service.

## Known gaps, in priority order

1. Server-held keys and plaintext captions and comments (03 roadmap; family vault).
2. One `MEDIA_KEK` for all families; no rotation procedure (D8).
3. Hard purge not scheduled on the hosted project; B2 deletion, auth-user removal and export worker not written (02 "Deletion").
4. Residency: Supabase logs outside the US; push via Apple and Google (01 "Residency").
5. No outside security review yet; open-sourcing is undecided (D10).
6. Messenger: no key verification (a compromised server could add a hidden phone to a chat), and chat metadata is visible to the server ([06-messenger.md](06-messenger.md)).

---
Last checked against code: 2026-10-21, A3 kept photo files (former-member row); earlier 2026-10-19, a522a3a (plus migrations 0014, 0015 messenger) and 624fc39 (MEDIA-1/2/3 on-phone cleaner, ONB-3/4 invite links)
