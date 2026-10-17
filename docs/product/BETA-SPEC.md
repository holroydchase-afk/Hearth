# Hearth Beta Spec: single source of truth

Owner: staff-pm. Updated Oct 17, 2026 (bulk photos, timeline and groups criteria at the end). **Milestones in `docs/product/ANCHORS.md` now set the order** (see "Milestone map and trace" at the end). Nov 22 / Thanksgiving is a soft target for milestones 3–4, pending Chase.

Rules: no criterion, no build. qa-tdd writes each test red before app-engineer builds.
- **Types:** `auto` means Playwright, SQL (RLS suite), or Deno. `manual` means a real phone or a real person, logged on the Test Log page.
- **Priorities:** P0 blocks the current ring. P1 must close before the next ring.
- **Platforms:** iPhone through TestFlight and Android through the Play internal track. Supported phones: Android 7+ and iOS 16.4+ on Expo SDK 56+; SDK 54/55 support iOS 15.1+. Pin the SDK after the phone inventory comes back.

## 1. Get in (JOIN)
| ID | Type | Pri | Given / When / Then |
|---|---|---|---|
| BETA-JOIN-1 | auto | P0 | **Given** a valid, unused invite for grandma@example.com, **When** she opens the invite link with the app installed and enters the 6-digit code emailed to her, **Then** she lands on the feed showing only posts shared to her circles, and no password field appears anywhere in the flow. |
| BETA-JOIN-2 | manual | P0 | **Given** a first-time grandparent with the app installed and an invite text, **When** she taps the link with no help, **Then** she sees the first photo within 2 minutes (stopwatch). |
| BETA-JOIN-3 | auto | P0 | **Given** an invite that is expired, already used, revoked, or addressed to a different email, **When** someone tries to redeem it, **Then** it is refused with a plain message ("This invite has expired. Ask Chase for a new one.") and no space data comes back. |
| BETA-JOIN-4 | auto | P0 | **Given** invite codes stored in the database (S9) and repeated redemption attempts (S10), **When** a manager reads the invites table, or the same account or IP fails 10 times in 10 minutes, **Then** no hash that can be cracked offline is readable, and the 11th attempt is rejected. |
| BETA-JOIN-5 | manual | P1 | **Given** a signed-in grandparent, **When** she force-quits the app, restarts the phone, and reopens after 7 days of no use, **Then** she is still signed in with no code requested. |
| BETA-JOIN-6 | manual | P1 | **Given** a grandparent who has never installed a beta app, **When** she follows the printed guide (TestFlight then Hearth on iPhone; Play link on Android) with Chase on the phone, **Then** she is installed and signed in within 10 minutes. |

## 2. Share (SHARE)
| ID | Type | Pri | Given / When / Then |
|---|---|---|---|
| BETA-SHARE-1 | manual | P0 | **Given** a parent on the feed, **When** they share 1–10 photos, **Then** it takes 3 taps or fewer after picking (Share, pick, Post), and the post appears at the top of their feed in under 60 seconds with no help. |
| BETA-SHARE-2 | auto | P0 | **Given** a fixture photo with GPS and maker EXIF, **When** it goes through the on-device pipeline, **Then** the uploaded file has no EXIF or GPS tags, and the server rejects any upload without `exif_stripped: true` (422). Manual confirmation: M-09. |
| BETA-SHARE-3 | auto | P0 | **Given** a completed upload, **When** the B2 object is fetched directly with storage credentials, **Then** the bytes are ciphertext that does not decode as an image, and the wrapped key exists in the database. |
| BETA-SHARE-4 | manual | P0 | **Given** a 5-photo post, **When** the network drops mid-upload (airplane mode) or the app is closed, **Then** the post shows "Waiting to send", finishes on its own within 1 minute of the signal returning or the app reopening, and creates no duplicate or partial post. |
| BETA-SHARE-5 | auto | P0 | **Given** a 12 MP photo, **When** it is shared, **Then** viewers get a 2048 px long-edge image (±1 px) plus a thumbnail of about 40 KB, with orientation preserved. |
| BETA-SHARE-6 | manual | P1 | **Given** a 60-second video on cellular, **When** it is shared, **Then** it uploads in under 60 s at 720p or below and plays on the oldest phone in the inventory. Videos over 60 s are refused with a plain message. |

## 3. See (SEE)
| ID | Type | Pri | Given / When / Then |
|---|---|---|---|
| BETA-SEE-1 | auto | P0 | **Given** the backend suite (110+ RLS cases) running on a **real** Supabase stack (S16), **When** the suite runs, **Then** it passes 3 times in a row: every member sees only posts shared to a circle they are in. |
| BETA-SEE-2 | manual | P0 | **Given** an app already in memory on a mid-range phone, **When** a grandparent opens it 5 times, **Then** the newest photo is visible within 1 s (median of the 5 timed opens). |
| BETA-SEE-3 | manual | P0 | **Given** the feed, **When** a grandparent taps a photo, **Then** it opens full screen, a swipe or the Next/Back buttons move between photos (no gesture-only actions), and a labeled Close button returns to the same feed position. |
| BETA-SEE-4 | manual | P1 | **Given** a full-screen photo, **When** the grandparent pinches or double-taps, **Then** it zooms. A full-screen video plays with visible play and sound controls. |
| BETA-SEE-5 | manual | P1 | **Given** a photo she can see (E10), **When** she taps "Save to phone", **Then** it appears in Photos or Gallery at 2048 px with no location data, and she gets a plain confirmation. |
| BETA-SEE-6 | auto | P0 | **Given** a member removed from a circle, **When** they request that circle's posts or the media again, **Then** the database denies them immediately, and any media URL already issued expires within 10 minutes. Manual confirmation: M-10. |

## 4. Choose who sees it (AUD)
| ID | Type | Pri | Given / When / Then |
|---|---|---|---|
| BETA-AUD-1 | manual | P0 | **Given** any post or the share sheet, **When** an adult is asked "who can see this?", **Then** 3 of 3 adults answer correctly from the screen alone. The screen names the circle and the number of people in words, for example "Grandparents – Dad's side · 6 people" (M-02). |
| BETA-AUD-2 | auto | P0 | **Given** a poster who last shared to circle A, **When** they open the share sheet, **Then** circle A is preselected and shown in words, never another user's default (B8), and Post is disabled if no audience is set. |
| BETA-AUD-3 | auto | P0 | **Given** a post to circle A, **When** a user who is only in circle B tries the feed, the post ID, the media signer, push, or email, **Then** every path denies them or sends nothing (signer returns 403). |
| BETA-AUD-4 | auto | P0 | **Given** two households sharing a child, **When** the co-parent separation suite runs (B2, S5, S11), **Then** neither side sees the other's circles, relatives, or posts unless a post was shared to the co-parent circle. |
| BETA-AUD-5 | auto | P0 | **Given** a poster's own post, **When** they delete it and confirm, **Then** it is gone from every feed on the next refresh, and its media URLs are refused within 10 minutes. |
| BETA-AUD-6 | manual | P1 | **Given** a posted photo, **When** the poster changes its audience, **Then** removed people lose it within 10 minutes, added people get it, and the screen says "Now shared with …". |

## 5. Hear about it (NOTIFY)
| ID | Type | Pri | Given / When / Then |
|---|---|---|---|
| BETA-NOTIFY-1 | manual | P0 | **Given** push turned on for a recipient, **When** 10 or more posts are made over Ring 1, **Then** the 90th-percentile delay between the server's `created_at` and the receipt logged on the device is 60 s or less. |
| BETA-NOTIFY-2 | auto | P0 | **Given** a post to circle A, **When** notices go out, **Then** only circle A members get a push or email, and the payload has no image URL, no child's name, and no caption. |
| BETA-NOTIFY-3 | manual | P0 | **Given** a push on the lock screen, **When** the grandparent taps it, **Then** the app opens directly to that post (cold and warm start). |
| BETA-NOTIFY-4 | auto | P1 | **Given** 5 photos in one post, or 3 posts within 10 minutes, **When** notices go out, **Then** each recipient gets 1 notice, not 5 or 3. |
| BETA-NOTIFY-5 | manual | P1 | **Given** a member who chose email or declined push, **When** a post is made, **Then** a daily digest arrives in the inbox, not spam, at Gmail, Yahoo/AOL, and Frontier test addresses, and its link opens the post in the app. |
| BETA-NOTIFY-6 | auto | P1 | **Given** a poster's own post, **When** audience members open it, **Then** "Seen by N of M" counts only audience members, updates within 1 minute, and is visible only to the poster. |

## 6. Say something back (REPLY)
| ID | Type | Pri | Given / When / Then |
|---|---|---|---|
| BETA-REPLY-1 | auto | P0 | **Given** a visible post, **When** a member taps the labeled Heart button, **Then** the heart toggles in one tap. Who sees the heart follows the reply rule (AUD-8 to AUD-10): the parents always; others only if the family or the group allows it. |
| BETA-REPLY-2 | auto | P0 | **Given** a visible post, **When** a member comments, **Then** only people the reply rule allows read it (AUD-8 to AUD-10; never anyone outside the post's audience), and a half-typed comment survives incoming hearts (B6). |
| BETA-REPLY-3 | auto | P0 | **Given** a heart or comment on Chase's post, **When** it's saved, **Then** Chase gets a notice within 60 s (batched as in NOTIFY-4), and the person who reacted gets nothing about their own reaction. |
| BETA-REPLY-4 | auto | P1 | **Given** a member removed from a circle, **When** they try to comment on, heart, or edit captions of its posts, **Then** the attempt is refused (S7, S12). |
| BETA-REPLY-5 | manual | P1 | **Given** a grandparent with no help, **When** asked to find the newest photo and leave a comment, **Then** she does it in under 60 s (M-01). |

**Count (Oct 15):** JOIN 6, SHARE 6, SEE 6, AUD 6, NOTIFY 6, REPLY 5 = 35 (24 P0, 11 P1). Plus JOIN-7, OPS-1 (Oct 15 pm) and NOTIFY-7, AUD-7, REPLY-6 (Oct 16) = 40.

## Grandparent test (used by the Ring 2 gate)
5 testers aged 65+. No help, 60 s cap per task. Pass means 5 of 5 tasks done.
1. Open the newest photo full screen.
2. Go to the next photo.
3. Heart it.
4. Leave a comment.
5. Answer "who else can see this photo?"

The test passes when 4 of 5 testers pass. Log each attempt on the Test Log with the phone model and the time.

## Not now
- Web viewer or web fallback: a second client to build and secure. Revisit only if the phone inventory shows someone who can't run the app.
- Web posting: the web viewer isn't in the beta.
- Co-parent setup UI: no split household in Rings 0–3. The backend separation tests stay as BETA-AUD-4.
- True background upload: retry on reopen (SHARE-4) covers the risk at much lower cost.
- Albums, free-text search, child tags (E9): Hearth works as a feed for 12 people. The timeline's "Pick a year" (BETA-TIME-4) covers finding old photos; caption search is in the ANCHORS ideas log.
- Multiple spaces per user: one family space covers the beta.
- Billing, paywall, and the video-cap messaging (E12): no money in the beta. The "willing to pay" question waits until after Thanksgiving.
- SMS or text-link notices: needs Twilio (paid) and A2P registration. Push and email are enough.
- Smart frames (E16) and other languages (E15): no tester has asked.
- Editing photos or captions: delete and repost is fine for the beta.
- Chat or DMs: families already have texting.
- Invite status, resend, and cancel (E13): Chase handles invites by hand for 12 people.
- Undo delete (E11): the delete confirm step (E1) is enough.
- Purge and export worker: no deletions at scale in 5 weeks, and Chase can run them by hand.
- Self-serve account deletion: Chase deletes on request. It's required before a public App Store launch.
- Analytics or crash SDKs: they break the no-tracker promise. Use TestFlight crash reports and Play vitals instead.

## Ring gates and evidence (superseded Oct 16 by the milestone gates below; kept for history)
| Ring | Dates | Gate (all must be met) | Evidence |
|---|---|---|---|
| 0: Chase alone | Oct 28–29 | All P0 `auto` criteria green 3× on the hosted stack. S9, S10, S16 closed. ≥10 posts over ≥2 days with 0 lost. 0 crashes. MEDIA_KEK restore tested. External build submitted to Beta App Review. | Test Log runs (IDs); sent vs received counts; TestFlight/Play crash pages; restore note; App Store Connect status |
| 1: + wife | Oct 30–Nov 5 | Wife passes JOIN-2 and SHARE-1 unaided. NOTIFY-1 p90 ≤ 60 s over ≥10 posts. 0 open P0. Beta App Review approved. Supabase Pro on. | Manual Test Log entries with times; latency log; ticket list; App Store Connect; Supabase billing page |
| 2: 3–5 family | Nov 6–12 | Grandparent test 4/5. Android user installs from the Play link in < 10 min unaided. All P0 and P1 manual criteria pass on ≥1 iPhone and ≥1 Android. 0 open P0/P1. NOTIFY-5 inbox check passes. Guide final. | Test Log grandparent runs; install time; ticket list; inbox screenshots; printed guide PDF |
| 3: WV grandparents | Nov 13–22 | Exit: 10 of 12 signed in and opened at least 1 post by Nov 22. 0 wrong-audience incidents. | Seen-by data; help-call log; P0 ticket list |

**Beta success signals, measured Nov 23 to Dec 20:** 80% of grandparents open new posts within 24 h. 0 help calls after each person's first week. 0 wrong-audience incidents. Chase and his wife share 3+ times a week with no family group texts.

## Amendments, Oct 15 pm (staff-pm; see docs/product/REMAINING.md)
- **BETA-SHARE-6 and the video half of BETA-SEE-4: out of beta.** iOS video location can't be stripped without a transcoder, so the app ships photos only (`VIDEO_POSTING_ENABLED=false`). It comes back in only if app-engineer shows on a device by Nov 5 that a transcode leaves no location in the file. Otherwise it goes to v1.0 (CORE-FEATURES CF-17).
- **BETA-REPLY-1:** "the audience sees who hearted it" becomes "the audience sees the heart count, and the person who hearted sees 'You loved this'". Names wait for v1.0, because there is no RPC for them.
- **BETA-JOIN-3 wording:** the app uses docs/eng/API.md's sentence ("This invite is too old or already used. Ask {inviter} for a new one."). The word "expired" is banned (UX-REVIEW). grandparent-ux confirms the final copy (GU-2).
- **New BETA-JOIN-7 (auto, P0):** **Given** a signed-in user, **When** they tap "Delete my account" and confirm, **Then** they are signed out, `my_spaces` returns `[]`, and a deletion request is recorded. This is pulled forward from "Not now" because Beta App Review expects in-app account deletion.
- **New BETA-OPS-1 (auto, P0, Ring 0):** **Given** a thrown error in the app, **When** it is reported, **Then** exactly 1 `client_errors` row is written with app version, OS and screen, and no caption, email, URL or key. The app has 0 third-party analytics or crash SDKs.
- **Notification sending is P0 for Ring 0** (NOTIFY-2, NOTIFY-4, REPLY-3 are auto P0s). It wasn't built in the backend lane. Owner: app-engineer (AE-2).
- **docs/product/GRANDPARENT-GUIDE.md** must stop saying "nothing to download". The beta requires installing the app (GU-3).

## Milestone map and trace (Oct 16, staff-pm)
`docs/product/ANCHORS.md` milestones supersede the ring gates above (kept for history). **M** = first milestone that needs the criterion (1 Chase end to end · 2 Mom, both sides posting · 3 savvy relative · 4 everyone else · 5 Android · 6 frame · 7 decide). **Trace** = the story problem or anchor it serves (A1 Anxiety-less, A2 Guilt-free, A3 US soil). No criterion or built feature is deleted.

| ID | M | Trace | Flag |
|---|---|---|---|
| JOIN-1 | 1 | A1: invite-only, no passwords ("preschool app") | |
| JOIN-2 | 2 | Setup is a family event; least-techy person | |
| JOIN-3 | 1 | A1: only invited people get in | |
| JOIN-4 | 1 | A1 | |
| JOIN-5 | 3 | Grandparent never stuck at a code screen | |
| JOIN-6 | 4 | Setup is a family event (printed guide, helper, number to call) | |
| JOIN-7 | 3 | Apple Beta App Review rule; weak A1 (you can leave) | **Flag:** traces to an Apple rule, not the story. Needed only for external TestFlight (M3) |
| SHARE-1 | 1 | Posting built for Charlotte; time is short | |
| SHARE-2 | 1 | A1: predators, stalkers (no location) | |
| SHARE-3 | 1 | A1, A3 | |
| SHARE-4 | 1 | "Someone doesn't get the photo"; time is short | |
| SHARE-5 | 1 | Blurry MMS between iPhone and Android | |
| SHARE-6 | 4 | STORY: in a chat with 1 Android the video arrives degraded, so Chase sends it to his stepmom separately and worries about offending his dad; with the in-laws, people do get offended | Deferred (Oct 15). **Note:** strong story trace, not a nice-to-have |
| SEE-1 | 1 | A1 | |
| SEE-2 | 4 | Viewing built for WV; slow old phones | |
| SEE-3 | 1 | Viewing built for WV; no gesture-only actions | |
| SEE-4 | 4 | Big photos for WV grandparents (photo half) | Video half deferred |
| SEE-5 | 3 | Grandparents print photos; A1 (no location in the saved file) | |
| SEE-6 | 1 | A1; STORY: households keep changing (new partners come and go), so removal must be real | |
| AUD-1 | 2 | Grandma A without Grandpa B, "and without worrying that he might"; A1 | |
| AUD-2 | 1 | A1: never post to the wrong side by default | |
| AUD-3 | 1 | STORY: up to 3 generations of separate households; Grandma A / Grandpa B on every path; A1 | |
| AUD-4 | 1 | Split families; A1 | **Flag:** the co-parent case is the Rob persona, not Chase's story (his split is among grandparents). Built and green; keep |
| AUD-5 | 1 | A1 | |
| AUD-6 | 3 | A1: a wrong audience can be fixed | Moved 2→3 (Oct 16 review): no app UI yet; delete + repost covers M2 |
| NOTIFY-1 | 2 | Guilt: photos actually reach grandparents | |
| NOTIFY-2 | 1 | A1; A3 (alerts transit Apple/Google with no photo, caption or child's name) | |
| NOTIFY-3 | 1 | Viewing built for WV | |
| NOTIFY-4 | 3 | STORY parental guilt: "one notice per post, so you can share often without spamming"; Kim | |
| NOTIFY-5 | 4 | Someone will never install an app (Earl's morning email); bridge to CF-18 | |
| NOTIFY-6 | 2 | Megan "know Grandma saw it"; parental guilt | **Flag: conflicts with A2.** Awaiting Chase's decision before M4 (ANCHORS conflicts table). Built code stays |
| REPLY-1 | 1 | A2: hearts are a signal people choose to show | |
| REPLY-2 | 1 | "Grandma A should be able to comment without Grandpa B seeing it" | **Flag (Oct 16 review):** today every comment is seen by the whole post audience, so a post to both sides lets Grandpa B read Grandma A. Model is Chase's call (ANCHORS); REPLY-6 makes it honest now |
| REPLY-3 | 1 | Guilt: the poster knows it landed, via chosen signals (A2-safe) | |
| REPLY-4 | 1 | A1 | |
| REPLY-5 | 4 | Viewing built for WV | |
| OPS-1 | 1 | A1 + A3: no third-party crash/analytics SDKs | |
| NOTIFY-7 *(new)* | 1 | Every message names a real person, so it can't pass for a scam (June) | Added Oct 16 |
| AUD-7 *(new)* | 1 | A2: no last-seen or login details | Added Oct 16 |
| REPLY-6 *(new)* | 1 | A1 + story core quote: "without worrying that he might" | Added Oct 16 review |

**By milestone:** M1 25, M2 4, M3 5, M4 6 (of 40 incl. JOIN-7, OPS-1 and the 2 new). M5 adds no new criterion: every manual criterion re-runs on an Android phone, plus "Android install < 10 min unaided". M6 has none (frame check is a yes/no investigation).

### Story problems with no passing criterion (checked against STORY.md, Oct 16)
1. **Grandma A comments without Grandpa B seeing, on a post shared to both sides.** No criterion: comments go to the whole post audience. REPLY-6 only makes this honest. Waits on Chase (ANCHORS conflicts table). STORY.md's Problems table calls this "Beta (backend tested)", which overstates it.
2. **"Viewers never see ... that other groups exist"** (STORY.md). No criterion, and comments and heart counts from the other side show that other groups exist. Same decision as 1.
3. **Video** (stepmom, dad, in-laws). SHARE-6 is deferred, so no active criterion.
4. **"No AI training, face scanning, or ads, in writing."** No criterion until the privacy policy (PS-3, M3).
5. **Earl never installs an app.** NOTIFY-5 covers notices only; viewing without the app is CF-18, v1.0.
6. **Relatives judging each other's engagement** (A2). NOTIFY-6 conflicts with it; waits on Chase.

### New criteria (Oct 16)
| ID | Type | Pri | M | Given / When / Then |
|---|---|---|---|---|
| BETA-NOTIFY-7 | auto | P1 | 1 | **Given** any push, sign-in email, digest or invite text, **When** it is generated, **Then** it names the real sender ("From Chase on Hearth" / "Chase invited you to Hearth"), never a generic "You have a new notification", and still carries no photo, caption or child's name. |
| BETA-AUD-8 | auto | P0 | 1 | **Given** a relative's comment or heart on a post, **When** the family hasn't changed the default, **Then** only the parents (owners and adults) and the post's author can read it; counts shown to others leave it out; a parent's own replies reach everyone the post went to. (Chase, Oct 16: "go with a safe bet considering privacy.") |
| BETA-AUD-9 | auto | P0 | 1 | **Given** a group with "members see each other's replies" on, **When** a post is shared to that group, **Then** its members read each other's replies on that post, and nowhere else. Only posters can flip the switch. |
| BETA-AUD-10 | auto | P1 | 1 | **Given** the family's owner, **When** they open replies to "everyone the post went to" (or back to parents only), **Then** it takes effect at once; nobody else can change it. |
| BETA-REPLY-6 | auto | P0 | 1 | **Given** a member about to comment on a post, **When** the comment box is shown and after Send, **Then** the screen says in words who will read it, matching what the server actually allows (today: "Everyone this photo was shared with can read this"), and never implies only the poster will (the current "Sent. Chase will see it." fails). |
| BETA-AUD-7 | auto | P0 | 1 | **Given** any member, **When** they call any RPC or table they can read, **Then** no other member's last-active, last-login, online status or device details come back. (Does not decide NOTIFY-6.) |

### Product review, Oct 16 (staff-pm, screens read, not run)
- **Mom as a poster (M2):** the backend allows owner-only `adult` invites and adults manage every group; the app's Invite button only makes `viewer` invites and there is no "new group" button. For M2, Claude seeds Mom's adult invite and both sides' groups by SQL from Chase's list. No setup UI (still "Not now").
- **AUD-6** (change audience after posting) has a backend RPC but no app UI; moved to M3. Delete + repost covers M2.
- **Comments cross sides** (REPLY-2 flag, new REPLY-6): honest wording now; the comment model is Chase's call.
- **Real names (NOTIFY-7, JOIN-1):** a new account's name defaults to the email prefix (`tg_handle_new_user`), so notices would read "From holroydchase on Hearth" and there is no way to set a name. Fix in the M1 build queue: the invite carries the name the poster types (viewers type nothing); posters set theirs once.
- **Email links** point at `hearth.family/p/<id>`, which doesn't exist yet. Until the website does, emails say "Open Hearth to see it" with no link.
- **Sign-in review (Oct 16, late), in build order:** (1) the hosted sign-in emails must show the 6-digit code (Supabase's default templates send a link, and `config.toml` sets no template), M1; (2) a pasted "123 456" must work (maxLength cuts it), M1; (3) typing an invite code, on the landing screen and on "Almost there", with the code shown on Chase's invite card (Expo Go can't open links), new **BETA-JOIN-8**, M1; (4) "check your junk folder" plus a 60 s wait before "Send a new code" (the built-in mailer allows 2 emails an hour), M1; (5) the wrong-email invite gets its own plain message with no address shown, needs privacy-security, M3; (6) "Did you mean yahoo.com?", M4. **"Start a family" stays Not now** (milestone 7): only Chase starts a family in the POC (`family-setup.sql`), and an open path breaks invite-only (A1).
- Already tracked, not new: no zoom (SEE-4, M4), no Delete my account (JOIN-7, M3), "Seen by" visible (A2 pending).

### Amendment, Oct 16 (staff-pm): NOTIFY-4 vs NOTIFY-1
NOTIFY-4 now reads: **Given** 5 photos in one post, or 3 posts within 10 minutes, **When** notices go out, **Then** each recipient gets 1 notice for the 5-photo post, and at most 2 for the 3 posts (the first right away so NOTIFY-1 holds; the rest as 1). Reason: the 60 s alert for the first post matters more than one extra buzz.

### Milestone gates (replace the ring gates)
| Milestone | Gate (all must be met) | Evidence |
|---|---|---|
| 1: Chase | All M1 `auto` criteria green 3× against the hosted project; S16 closed; M1 `manual` criteria (SHARE-1, SHARE-4, SEE-3, NOTIFY-3, M-09) pass on Chase's iPhone; ≥10 posts over ≥2 days to a second test account, 0 lost; 0 crashes; `MEDIA_KEK` on paper ×2 | CI runs; Test Log entries; QA-3 sent vs received; `client_errors` count |
| 2: Mom | Mom joins as a poster (adult) and passes JOIN-2 and SHARE-1 unaided (stopwatch); both post to both family sides' groups with 0 cross-side leaks; AUD-1 2 of 2; NOTIFY-1 p90 ≤ 60 s over ≥10 posts; 0 open P0 | Test Log times; latency log; ticket list |
| 3+ | Defined when M2 passes. Grandparent test (above) is the M4 entry check; A2 "Seen by" decided before M4 | |

## Bulk photos and timeline criteria (Oct 17, overnight plan)
Source: the overnight plan "How each piece should work" (Chase's go, Oct 17, 3:26 am). Backend in migration **0010**. Video stays off (SHARE-6); audio, albums, free-text and AI search are cut.

| ID | Type | Pri | M | Given / When / Then |
|---|---|---|---|---|
| BETA-BULK-1 | auto | P0 | 1 | **Given** a picked photo, **When** it is prepared on the phone, **Then** its date is read on the phone (EXIF `DateTimeOriginal` with `OffsetTimeOriginal` if present, else the photo's creation time, else none) and only `taken_at` is sent; the uploaded file still has no EXIF or GPS (SHARE-2). |
| BETA-BULK-2 | auto | P0 | 1 | **Given** up to 100 photos picked at once, **When** the batch is planned, **Then** they are grouped by the day taken (the photo's own local day when its offset is known, else the phone's time zone) into posts of at most 10 (48 photos from 3 days become 5 posts), undated photos go together last, and a pick over 100 keeps the first 100 and says so. |
| BETA-BULK-3 | auto | P0 | 1 | **Given** a planned batch, **When** the review screen shows, **Then** it reads "48 photos from 3 days", "Send to:" names the audience in words (default: the last group used, never a silent Everyone) with a labeled Change button, and nothing sends until Send is tapped. |
| BETA-BULK-4 | auto | P0 | 1 | **Given** a batch sending, **When** the app is killed mid-batch and reopened, **Then** progress reads "Sending 12 of 48 photos…" across the whole batch, the rest finish on their own, and no post is duplicated or lost. |
| BETA-BULK-5 | auto | P0 | 1 | **Given** a pick with videos, a Live Photo and a HEIC photo, **When** it is planned and prepared, **Then** videos are left out with "Hearth can't send videos yet, so 3 videos were left out.", and the Live Photo and HEIC each become one JPEG with no EXIF that keeps its date. |
| BETA-BULK-6 | auto | P0 | 1 | **Given** a batch of 5 posts and 48 photos taken in July 2024, **When** notices go out, **Then** each person in the audience gets 1 notice for the whole batch ("Chase added 48 photos from July 2024", full month names), not one per post, and it carries no photo or caption. |
| BETA-TIME-1 | auto | P0 | 1 | **Given** old photos imported today, **When** anyone opens Photos, **Then** it stays newest-shared-first, and posts taken more than 30 days before they were shared sit in one "Older photos" card ("Chase added 48 older photos from July 2024. See them") that opens the timeline at that month. |
| BETA-TIME-2 | auto | P0 | 1 | **Given** posts with and without `taken_at`, **When** `get_timeline` is called, **Then** posts come back by `coalesce(taken_at, published_at)` newest first, with keyset pages that have no gaps or duplicates, using the same visibility function as `get_feed`. |
| BETA-TIME-3 | auto | P0 | 1 | **Given** a post someone isn't allowed to see, **When** they call `get_timeline` or `get_timeline_years`, **Then** it is missing as if it never existed (not in any page, not in any year count), and the allowed person does see and count it. |
| BETA-TIME-4 | auto | P1 | 1 | **Given** the timeline, **When** it shows, **Then** it opens from a labeled "By date" button on Photos, has month and year headers ("July 2024"), and a labeled "Pick a year" button lists years with photo counts; no scrubber or gesture-only control. |
| BETA-BULK-7 | manual | P0 | 1 | **Given** Chase's iPhone in Expo Go, **When** he bulk-picks 20 photos from 2 trips (one abroad, one Live Photo, one HEIC) and turns on airplane mode mid-batch, **Then** each lands on the day it was taken, the batch finishes when signal returns, and a downloaded copy has no location (M-13, M-14). |

| ID | M | Trace | Flag |
|---|---|---|---|
| BULK-1 | 1 | A1: no location leaves the phone (predators, stalkers); M1 "photos land by the date they were taken" | Photos sent without `taken_at` can't be re-dated, so this ships first |
| BULK-2 | 1 | Time is short (Charlotte); M1 "years of photos on his phone" | Time zones: the 11 pm vacation photo |
| BULK-3 | 1 | A1: 100 photos to the wrong side is the worst A1 failure | privacy-security review before it ships |
| BULK-4 | 1 | "Someone doesn't get the photo" (SHARE-4) | |
| BULK-5 | 1 | A1 (no location); iPhone defaults (Live Photo, HEIC) | Video stays off until the Nov 5 device proof |
| BULK-6 | 1 | Parental guilt: share often without spamming (NOTIFY-4) | Chase's answer Oct 17: one batch notice. Month in the push needs privacy-security review |
| BULK-7 | 1 | Plan's stop rule: if Expo Go can't read EXIF dates (`exif: true`), stop and report | Needs Chase's phone |
| TIME-1 | 1 | Viewing built for WV: new posts are what relatives open the app for | First cut if the night runs short |
| TIME-2 | 1 | M1 "see them land in the right place by the date taken" | |
| TIME-3 | 1 | A1 | 0011 adds the share-history cutoff in the same shared function (AUD-20) |
| TIME-4 | 1 | Grandparents "find the ones from Christmas"; no gesture-only actions | Second cut if the night runs short |

## Groups criteria (Oct 17, staff-pm; reworked from the hierarchy after Chase's 2:47 am answer)
Full spec, roles, data model, reply rule and worked cases: `docs/product/SPEC-GROUPS.md`. Fixed shape: Everyone, set groups (Chase's side, Mom's side), households slightly under them; a person can be in several households and a household in several groups (siblings). Events combine any groups and households (Charleston trip, Gigi's birthday, any custom group). Only parents send to Everyone. Adding anyone means an explicit "Share all past photos" or "Only new photos", no default. A relative's replies reach their household(s), their event-mates on event posts, the post's author and the parents. Ships in migration 0011 (0010 is the timeline) before milestone 3; does not block M1 or M2 (AUD-16 is the only M2 item, so the migration can't change anyone's feed).

| ID | Type | Pri | M | Given / When / Then |
|---|---|---|---|---|
| BETA-AUD-11 | auto | P0 | 3 | **Given** Chase's side and Mom's side, each with its households, **When** a parent posts to Mom's side, **Then** every person placed in a household under it, plus both parents, can see it, and nobody placed only under Chase's side can (feed, timeline, post ID, media signer, push and email all deny). |
| BETA-AUD-12 | auto | P0 | 3 | **Given** Mom's sister placed in Memaw's house and in Pawpaw and Granny's house, **When** posts go to Mom's side, to either house, and to Everyone, **Then** she sees each exactly once in her feed and timeline, and sees no post sent only to Chase's side. |
| BETA-AUD-13 | auto | P0 | 3 | **Given** containers in one space, **When** someone links a group under a group, a household under a household, anything under a household, an event under anything, places a person in a group or event, links across two spaces, makes a loop, or a non-parent calls any setup RPC, **Then** each is refused (`23514` for bad shape, `P0002` for non-managers) and nothing changes. |
| BETA-AUD-14 | auto | P0 | 3 | **Given** a relative (viewer), **When** they call every RPC and read every table they can, **Then** no group, household or event name, kind, link, member count, or other household's member comes back; their own feed shows only posts and their authors. |
| BETA-AUD-15 | auto | P0 | 3 | **Given** a person removed from a household, or a household unlinked from a group or event, **When** they request those posts or media, **Then** the database denies them in the same transaction and issued media URLs expire within 10 minutes (as SEE-6). |
| BETA-AUD-16 | auto | P0 | 2 | **Given** today's flat groups with their members and posts, **When** migration 0011 runs, **Then** for every user `get_feed`, `get_timeline` and `can_view_post` return exactly what they returned before (snapshot diff, 0 changes), and one Everyone exists per space. |
| BETA-AUD-17 | manual | P0 | 3 | **Given** the share sheet on Chase's iPhone, **When** Chase and Mom each share one photo to Everyone and one to the Charleston trip, **Then** Everyone is first and takes 1 tap, Groups then Events follow, each reads as name plus "N people", and both answer "who sees this?" correctly from the screen alone (2 of 2). |
| BETA-AUD-18 | auto | P0 | 3 | **Given** a Charleston trip event linking Pawpaw and Granny's house and Mom's sister, **When** a parent posts to it, **Then** Pawpaw, Granny, the sister and both parents see it; Memaw, Gammy and Great-Grandma don't; and the same people still get Mom's side and Everyone posts. |
| BETA-AUD-19 | auto | P0 | 3 | **Given** a parent inviting a relative, placing a person, or linking a household or group, **When** no share-history choice is sent, **Then** the server refuses (`23514`); and in the app the invite form shows "Share all past photos" and "Only new photos" with neither selected and "Make the invite" off until one is picked (Jest). |
| BETA-AUD-20 | auto | P0 | 3 | **Given** Gigi added with "Only new photos" at time T, **When** she asks for a post shared before T by feed, timeline, years list, post ID, media signer or replies, **Then** each answers "not found"; posts shared at or after T show, including old photos bulk-imported after T; with "Share all" she sees all. A parity test shows every reader agrees for every user. |
| BETA-AUD-21 | auto | P0 | 3 | **Given** a relative allowed to post, **When** they try to send to Everyone by `create_post` or a direct `post_audiences` insert, **Then** both are refused; owner and parents succeed. Every permission check goes through `can(space, capability)`. |
| BETA-AUD-22 | manual | P1 | 4 | **Given** Chase on his phone, **When** he makes "Thanksgiving 2026" by ticking groups and households, **Then** it takes under 60 s unaided, shows under Events in the share sheet as name plus "N people", and the screen says everyone in it can read each other's comments on its photos. |
| BETA-REPLY-7 | auto | P0 | 3 | **Given** a post to Everyone, **When** Gammy comments and hearts it, **Then** Chase, Mom, the post's author and Gammy's household read both; Grandaddy and Grandmomma read neither, and their counts leave them out. |
| BETA-REPLY-8 | auto | P0 | 3 | **Given** a post to the Charleston trip event, **When** Granny comments, **Then** Pawpaw, Mom's sister, the parents and the author read it (event rule; flips to "the sister does not" if Chase answers "Household" to SPEC-GROUPS question 1). |
| BETA-REPLY-9 | auto | P0 | 3 | **Given** Mom's sister placed in Memaw's house and Pawpaw and Granny's house and a post to Everyone, **When** each of them comments, **Then** the sister's comment reaches Memaw, Pawpaw and Granny; Memaw's reaches the sister but not Pawpaw or Granny; Pawpaw's reaches Granny and the sister but not Memaw (no relay). |
| BETA-REPLY-10 | auto | P0 | 3 | **Given** a parent's comment or heart, **When** anyone who can see the post reads it, **Then** they see it; and a parent reads every reply on every post they can see. |
| BETA-REPLY-11 | auto | P1 | 3 | **Given** each reply case (household, sibling, event, parent), **When** the comment box shows and after Send, **Then** `reply_readers` names exactly the people the server allows (compared to `can_see_reply` for every member), and the app says them in words, for example "Memaw, Pawpaw, Granny, Chase and Mom will read this". |
| BETA-REPLY-12 | auto | P0 | 3 | **Given** migration 0011, **When** anyone calls `set_group_replies_shared` or reads `circles.replies_shared`, **Then** the function and column are gone, `my_circles` has no `replies_shared`, and the Groups screen has no switch (Jest). |
| BETA-REPLY-13 | auto | P1 | 4 | **Given** a relative allowed to post, **When** they post, **Then** it goes to the groups they're in with no picker (or Everyone, per SPEC-GROUPS question 2), the screen names who will see it, they read every reply on it, and others' replies on it follow REPLY-7 to 9. |

**Amendments when migration 0011 ships**
- **BETA-AUD-9 retired** (the per-group "members see each other's replies" switch). Chase, Oct 17: remove it. REPLY-12 proves it's gone.
- **BETA-REPLY-1 and REPLY-2:** "others only if the family or the group allows it" becomes "the commenter's household(s), event-mates on event posts, the post's author and the parents; everyone only if the owner opened replies (AUD-10)".
- **BETA-REPLY-6:** the words come from `reply_readers` (REPLY-11).
- **Story problems with no passing criterion, #1 and #2:** covered by REPLY-7, REPLY-9 and AUD-14 once green.
- **Not now:** group inside a group, drag or guided setup, event dates, place, RSVPs and invites to an occasion, group chat, per-person grants, a screen to change share history later. Room left (spec sections 3, 4, 7).

**Trace:** AUD-11, AUD-12: "Two families' worth of households, not one"; "My parents are divorced and remarried" (the sibling). AUD-17: "for us 90% of the content we post will be to everyone". AUD-18, AUD-22, REPLY-8: birthday at Gigi's; the Charleston trip. AUD-19, AUD-20: PERSONAS "A new partner may join later, or may be kept out"; A1. AUD-21: "only people they trust are in it"; Chase, Oct 17 ("Maybe only parents can send to everyone"). AUD-13, AUD-15, AUD-16: A1. AUD-14: "Viewers never see group names or that other groups exist". REPLY-7, 9, 10, 11: "Grandma A should be able to comment on a photo without divorced Grandpa B seeing it, and without worrying that he might"; A2. REPLY-12: Chase's Oct 17 call. REPLY-13: "Parents set it up; everyone else just posts".

**Count:** 44 IDs before Oct 17 (incl. AUD-8 to 10 and JOIN-8) + 12 AUD + 7 REPLY = 63; 62 live once AUD-9 retires. New ones by milestone: M2 1, M3 16, M4 2.
