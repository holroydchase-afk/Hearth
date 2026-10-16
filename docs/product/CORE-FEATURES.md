# Hearth: core features (beyond the beta)

Owner: staff-pm. Written Oct 15, 2026. Beta scope and its tests stay in `docs/product/BETA-SPEC.md`. This file covers what Hearth has to be to solve the problems it exists for, and when each part ships.

**Phases:** **Beta** = 12 WV grandparents by Sun Nov 22, 2026 · **v1.0** = public launch, about Q1 2027 · **Later** = after v1.0 proves people keep using it.
**Rule:** v1.0 gets small and deep. A feature reaches v1.0 only if one of the 7 problems below stays unsolved without it. Personas are in `docs/product/PERSONAS.md`.

**Count:** 30 numbered features: **Beta 18 · v1.0 8 · Later 4** (plus an unscheduled parking lot at the end). CF-12 and CF-25 have parts in two phases; each is counted in the phase where it first ships. Some features serve two problems; each is listed once, under the problem it mainly solves.

---

## 1. Divorced or fractured families, across generations
*Rob (co-parent), Megan (organizer), Linda (other-side grandma)*

| ID | Feature | Persona | Done when | Phase |
|---|---|---|---|---|
| CF-01 | **Every post has a named audience.** Post to one or more groups; the poster sees "Grandparents – Dad's side · 6 people" on the post and in the share sheet | Megan, Rob | BETA-AUD-1/2/3 pass; 3 of 3 adults answer "who can see this?" from the screen alone | Beta |
| CF-02 | **Households never see each other's groups.** Each household owns its space. A co-parent sees only the posts shared to the "Co-parent" group, and that group's name only | Rob | BETA-AUD-4 auto green on the real stack; M-11 run with two real phones, 0 leaks | Beta (backend) |
| CF-03 | **Co-parent link setup.** Invite the other parent into a Co-parent group in 3 screens; link the shared child into both spaces; each side keeps full control of its own posts. Fixes S11 (a guardian can't unlink the other household's child) and S13 | Rob | 3 real split families set it up unaided in < 5 min; separation suite plus S11/S13 tests green; 0 leaks over 60 days | **v1.0** |
| CF-04 | **Change who sees a post after posting.** People removed lose it within 10 min; added people get it; the poster sees "Now shared with …" | Rob, Megan | BETA-AUD-6 auto plus manual; the media URL refuses removed people within 10 min | **v1.0** (backend exists; UI cut from beta) |
| CF-05 | **Grandparents on both sides feel equal.** Viewers never see group names or that other groups exist; the feed heading names the kids, not the group | Linda | UXG-07 (no "group" or "circle" on viewer screens); Linda interview: she can't tell she is in a smaller group | Beta |
| CF-06 | **One feed across several families.** A grandparent invited by two of her children (two spaces) sees one feed, each photo labeled "From Chase" or "From Amy". Posters still have one space each | Linda, June | A viewer in 2 spaces sees both in one list, newest first, in one call (p95 < 30 ms); no cross-space leak (new RLS cases) | **v1.0** |

## 2. Avoiding social media
*Megan, June, Linda*

| ID | Feature | Persona | Done when | Phase |
|---|---|---|---|---|
| CF-07 | **Invite-only, no public anything.** No profiles, search, discovery, followers or share-to-public. An invite works only for the person it was addressed to | Megan, June | BETA-JOIN-3/4 green; no public URL returns content (security test) | Beta |
| CF-08 | **A calm, finite feed.** Newest first, no ranking, no autoplay, no counts visible to non-audience; reaching the end says "You're all caught up" | June, Kim | No ranking code exists; the "caught up" state is tested | Beta |
| CF-09 | **Quiet notices.** One notice per post (not per photo), batched within 10 min; each person picks push, a daily email or a weekly email | Kim, Megan | BETA-NOTIFY-4/5 pass; ≤1 notice per recipient per 10 min | Beta |

## 3. No AI training on kids' photos
*Megan, Rob*

| ID | Feature | Persona | Done when | Phase |
|---|---|---|---|---|
| CF-10 | **Encrypted before it leaves the phone.** Per-photo keys, AES-256-GCM; the storage vendor holds only ciphertext; no face scanning, tagging or ML of any kind | Megan, Rob | BETA-SHARE-3 green; no ML or vision dependency in the app or backend (CI grep); the promise is written in the privacy policy and terms | Beta |
| CF-11 | **Location stripped on the phone.** EXIF and GPS are removed and the bytes scanned before upload; the server refuses unstripped uploads | Megan | BETA-SHARE-2 auto green plus M-09 on both platforms | Beta |
| CF-12 | **Leave and take everything.** In-app "Delete my account" (beta: request, Chase finishes by hand). v1.0: a self-serve zip export of your photos and comments, and a worker that really deletes blobs within 30 days | Megan, Rob | Beta: BETA-JOIN-7. v1.0: export zip opens on a PC with the originals; a purged blob returns 404 from B2 within 30 days (automated test) | Beta (delete) / **v1.0** (export + purge) |
| CF-13 | **Proof, not promises.** A public "Where your photos live" page: vendors, regions, what each can see (ciphertext only), and signed no-training letters (B2 DPA) | Megan | The page is live; every vendor in the list has a DPA or written no-ML statement on file | **v1.0** |

## 4. US-only data
*Megan, Rob*

| ID | Feature | Persona | Done when | Phase |
|---|---|---|---|---|
| CF-14 | **Photos and database stored in the US.** Supabase East US, B2 US East, US backups; crash reports kept in our own database (no third-party SDKs). The public promise is "stored in the US" (auth logs may be processed elsewhere, so we disclose that) | Megan | Region settings screenshotted in the runbook; 0 third-party SDKs (CI check); policy wording reviewed by privacy-security | Beta |

## 5. iPhone↔Android texts failing
*Megan, June, Earl*

| ID | Feature | Persona | Done when | Phase |
|---|---|---|---|---|
| CF-15 | **Same full-quality photo on both phones.** Native apps on iPhone and Android; 2048 px photos; nothing goes through MMS | Megan, June | BETA-SHARE-5 plus M-07 (iPhone → Galaxy A, sharp, 2048 px) | Beta |
| CF-16 | **Save to my phone** at 2048 px, no location, with a plain confirmation (grandparents print them) | June, Earl | BETA-SEE-5 plus UXG-08 | Beta |
| CF-17 | **Video that works everywhere.** ≤60 s, transcoded on the phone to 720p H.264 with location stripped; plays with sound and big controls on the oldest phone in the survey | Megan, June | SHARE-6 plus a metadata scan of the transcoded file shows no location; plays on a 4-year-old Galaxy A and on iOS 15 | **v1.0** |
| CF-18 | **Reach people who won't install an app.** Either (a) a personal, signed web link that opens the photos in any browser, or (b) a text message with a link. Chase decides (question 1) | Earl, June | Earl, on an iPad Air 2 with no app, sees the morning's photos from one tap in an email or text; the link works only for him and expires | **v1.0** |

## 6. Parents juggling 5 group texts
*Megan, Kim*

| ID | Feature | Persona | Done when | Phase |
|---|---|---|---|---|
| CF-19 | **Post once, pick who.** 3 taps after picking photos; the last audience is remembered; uploads survive bad signal and app restarts with no duplicates | Megan | BETA-SHARE-1 (< 60 s unaided), SHARE-4 (0 lost, 0 duplicates) | Beta |
| CF-20 | **Know Grandma saw it.** "Seen by 4 of 6" on your own posts; hearts and comments come back to the post; you get one notice | Megan | BETA-NOTIFY-6, REPLY-1/2/3 | Beta |
| CF-21 | **Two parents, one space.** Spouse posts as an adult in the same space, with the same groups | Megan | Ring 1: wife posts unaided (SHARE-1) | Beta |
| CF-22 | **Invite status and resend.** See who joined, who's pending, and who hasn't opened anything in 14 days; resend or cancel in one tap (E13) | Megan, Tammy | Status matches the DB within 1 min; resending makes a new code and kills the old one (auto) | **v1.0** |

## 7. Grandparents who aren't comfortable with tech
*June, Earl, Tammy*

| ID | Feature | Persona | Done when | Phase |
|---|---|---|---|---|
| CF-23 | **No passwords, ever.** Invite link, then a 6-digit email code; stay signed in for good | June | BETA-JOIN-1/2/5; first photo within 2 min unaided | Beta |
| CF-24 | **A viewer app built for her.** Two tabs (Photos, Help); Bigger text on by default; 48 pt targets; 17 pt+ text; plain words; "Call Chase" first on Help; the grandparent test passes | June | UXG-01–24 green; grandparent test 4 of 5 testers pass; 0 help calls after week 1 | Beta |
| CF-25 | **Set up by a helper.** Tammy can see who in the family is set up and walk June through it from a printed guide; v1.0 adds a helper code so Tammy can finish June's setup on June's phone | Tammy | Beta: printed guide, 10 min install (JOIN-6). v1.0: Tammy sets up 2 phones unaided in < 10 min each | Beta (guide) / Later (helper code) |

## Paid plan (introduced in v1.0)

**Recommendation:** charge for volume and keepsakes, never for the core promise or the split-family wedge. Co-parent linking stays **free**. This reverses `docs/eng/research.md` §7, because the wedge only spreads if both households can join without paying.

| ID | Feature | Free | Family ($4.99/mo or $39.99/yr) | Phase |
|---|---|---|---|---|
| CF-26 | **Family plan via in-app purchase** (StoreKit / Play Billing, one subscription covers the space and its co-parent link) | — | ✓ | **v1.0** |
| | Photos | Unlimited | Unlimited | v1.0 |
| | Video | 10/month, ≤60 s | Unlimited, ≤3 min | v1.0 |
| | Groups, co-parent link, web/text reach for grandparents | ✓ | ✓ | v1.0 |
| | "Seen by" with names (count is free) | count only | names | v1.0 |
| CF-27 | Original-resolution storage and download (for printing) | — | ✓ | Later |
| CF-28 | Yearly keepsake export (zip + printable PDF book) | — | ✓ | Later |
| CF-29 | Smart frame feed for a group (E16) | — | ✓ | Later |
| CF-30 | Gift a year (a grandparent pays for the family) | — | ✓ | Later |

## Never build

These are permanent. Each is a reason someone would leave Facebook for us.

1. **Ads**, sponsored posts, or "partners".
2. **AI training on user content**, ours or anyone's, and no licensing or selling content or data.
3. **Face recognition, auto-tagging or image analysis on our servers.** Not even "for search".
4. **Public profiles, discovery, followers, public like counts, or public links** that don't expire.
5. **Third-party trackers or analytics SDKs**, including "free" crash reporters that phone home.
6. **Contact book upload** or "find friends".
7. **Location features:** maps, check-ins, "near you".
8. **Engagement mechanics:** algorithmic ranking, streaks, infinite autoplay, or "memories" that resurface old photos without the poster opting in (painful after a divorce).
9. **Storage or processing of photos outside the US.**
10. **Any way for one household to see the other's groups or people**, even as a paid feature.
11. **Generative AI edits of kids' photos.**

## Parking lot (not scheduled; revisit after 60 days of v1.0 usage)
Albums and events · search · child tags/filter (E9) · grandparents posting their own photos · quiet hours · Spanish (E15) · undo delete (E11) · comments with photos · end-to-end encryption (question 2) · print ordering · a court-order "supervised" mode for co-parents (question 3) · desktop web posting.

## v1.0 in one list (8 new, plus finishing CF-12)
CF-03 co-parent link · CF-04 change audience · CF-06 one feed across families · CF-12 export + real deletion (finishing the beta's delete) · CF-13 "where your photos live" page · CF-17 video · CF-18 no-install reach · CF-22 invite status · CF-26 Family plan.
**Most important 5:** CF-03, CF-17, CF-18, CF-04, CF-06.
**Launch bar on top of the features:** VoiceOver and TalkBack labels on every screen; account deletion completes on its own; staging → prod releases through CI; the restore drill passes each quarter.

---

## 5 product questions only Chase can answer

1. **Earl's email.** Do grandparents who won't install get (a) a personal web link to photos, which means building and securing a second client, or (b) a text with a link, which needs Twilio, a registered business and about $10–20/month? Photos *inside* the email are off the table, because Gmail and Yahoo would then hold the kids' photos. My pick is (a), because it also covers the iPad and the flip-phone household.
2. **Who holds the keys.** Server-held keys (today) let us recover a lost phone and run a web viewer. End-to-end encryption is a stronger promise, but a lost phone with no backup means lost photos, and a web viewer becomes much harder. Which promise do you want to market? My pick: server-held for v1.0, with honest wording, and E2EE as a later paid "vault" option.
3. **Co-parent conflicts.** When one parent wants a photo of the child removed from the *other* household's space, does Hearth do anything (notify, mediate, a court-order mode), or is each household fully sovereign? This decides CF-03's design and your support burden.
4. **Who pays.** Is the payer the organizer parent, or do grandparents gift it? Is co-parent linking free (my recommendation) or the main paid hook (docs/eng/research.md's original plan)? Do we charge at v1.0 or after 1,000 families?
5. **Launch shape.** Is v1.0 a public listing in both stores, or an invite-only waitlist that grows through families who already use it? Do you form an LLC first? That decides Apple organization enrollment, Play organization registration (no 14-day closed test), SMS registration, and liability for kids' data.
