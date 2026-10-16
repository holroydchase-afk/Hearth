# Hearth — Day 1 plan (Oct 15, 2026)

Working name: **Hearth**. Private photo and video sharing for families, built for split households and grandparents who won't join social media.

## Problem → what v1 does about it

| Problem | v1 answer |
|---|---|
| Divorced / split families | Each household owns its own **circles**. Every post has a visible audience. Co-parents can share kid logistics with each other without either seeing the other's family circles. |
| Don't want social media | Invite-only. No public profiles, likes counts, feeds from strangers, or ads. |
| Kids' photos used for AI | Written promise: no AI training, no face scanning. Media encrypted with our keys before it reaches the storage vendor. |
| Keep data in the USA | Photos, videos and the database stored in US regions (Backblaze B2 US-East + Supabase US). Honest limit: Supabase processes some auth logs outside the US, so the public promise is "stored in the US." |
| iPhone ↔ Android texts that don't arrive | Hearth doesn't depend on SMS/MMS for the photo. Notifications go by app push, a plain **text with a link**, or email digest. The photo opens in the app or any browser. |
| 5 crazy group texts | One space, many circles. Post once, pick who sees it. Grandma picks how she's told (text link, daily or weekly email). |

## v1 = MVP for 20 family members, iPhone first

**What ships in v1:** sign in by email/text link (no passwords) · create circles · post photos/videos with an audience · change audience after posting · reactions + comments · "who can see this" on every post · notification choice per person · invite link · web viewer for anyone who won't install.

**Not in v1:** multilingual, smart frames, paid plan, export zips, albums, search.

### Distribution
- **iPhone:** Expo app → TestFlight **public link** (external testing; one Beta App Review on the first build, then updates are quick). Needs the Apple Developer account, $99/yr. TestFlight builds expire after 90 days, so we push a fresh build monthly anyway.
- **Android (soon after):** same codebase. Fastest path is an Expo internal-distribution install link; cleaner path is Google Play internal testing (up to 100 testers, $25 one-time). Register Play as an organization to avoid the 12-tester / 14-day rule for personal accounts when we go public.
- **Anyone else:** the web viewer link works on any phone today.

### Costs for the 20-person beta
- Supabase free tier during beta ($0; it pauses after a week idle — fine while testing, switch to Pro $25/mo before real launch)
- Backblaze B2: ~1 GB/family/year → pennies
- Expo EAS free tier: 15 iOS + 15 Android builds/month, push notifications free
- Resend email free tier (3,000/mo)
- **Required now: $99 Apple. Later: $25 Google.**

At scale (from research): ~$0.06/family/month at 1,000 families, ~$0.03 at 50,000. Suggested pricing later: free tier + Family plan $4.99/mo or $39.99/yr (unlimited video, linked co-parent households, export).

## What exists today
- `docs/eng/research.md` — stack, pricing, competitor gaps, cost model, sources.
- `backend/` — Postgres schema with row-level security, media-signing edge function, seed data, 90/90 permission tests + 5/5 function tests passing.
- **Hearth prototype** artifact — clickable v1 on your phone. Switch "Viewing as" to see exactly what each relative sees.

## Next steps (you)
1. Click through the prototype as Grandma Jo, Nana Ruth and Alex. Note anything confusing.
2. Create accounts: Apple Developer ($99), Supabase (free), Backblaze B2, Expo. These need your identity and card, so I can't do them.
3. Pick the real name (check the App Store + domain).

## Day 2 (Oct 15): test-first pass
- 32 prototype test cases (33 tests) written before any fix. Red run: 12 passing. Green run: 32/32, stable across 3 runs.
- Fixed 10 prototype bugs (worst: co-parent could see the other household's relatives) and shipped 8 features: delete post, full-screen photo viewer, invite flow with circles, "Seen by", larger text, remove picked photo, rename/delete circles, revocation count.
- Security review fixed 7 backend holes (worst: removed members kept access to their old posts). Backend now 110/110.
- 16 items open in the backlog. Everything is tracked on the Hearth Test Log page. Workflow is in docs/eng/TESTING.md.

## Next steps (me, next session)
1. Build the Expo app screens against the backend (feed, share, circles, invites, settings).
2. Background worker: storage purge + export.
3. TestFlight build #1 and the 20-person invite plan.

## Open risks
- Encryption keys are ours, not end-to-end. Losing the master key loses photos — needs a key backup plan before real launch.
- Revoked viewers keep anything they already downloaded.
- Backblaze's terms are vague on "improving the service" — get written no-AI-training confirmation.
