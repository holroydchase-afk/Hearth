# Hearth Beta Spec: single source of truth

Owner: staff-pm. Updated Oct 16, 2026. **Milestones in `ANCHORS.md` now set the order** (see "Milestone map and trace" at the end). Nov 22 / Thanksgiving is a soft target for milestones 3–4, pending Chase.

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
| BETA-REPLY-1 | auto | P0 | **Given** a visible post, **When** a member taps the labeled Heart button, **Then** the heart toggles in one tap, and the audience sees who hearted it. |
| BETA-REPLY-2 | auto | P0 | **Given** a visible post, **When** a member comments, **Then** only that post's audience sees the comment, and a half-typed comment survives incoming hearts (B6). |
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
- Albums, search, child tags (E9): Hearth works as a feed for 12 people.
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

## Amendments, Oct 15 pm (staff-pm; see REMAINING.md)
- **BETA-SHARE-6 and the video half of BETA-SEE-4: out of beta.** iOS video location can't be stripped without a transcoder, so the app ships photos only (`VIDEO_POSTING_ENABLED=false`). It comes back in only if app-engineer shows on a device by Nov 5 that a transcode leaves no location in the file. Otherwise it goes to v1.0 (CORE-FEATURES CF-17).
- **BETA-REPLY-1:** "the audience sees who hearted it" becomes "the audience sees the heart count, and the person who hearted sees 'You loved this'". Names wait for v1.0, because there is no RPC for them.
- **BETA-JOIN-3 wording:** the app uses API.md's sentence ("This invite is too old or already used. Ask {inviter} for a new one."). The word "expired" is banned (UX-REVIEW). grandparent-ux confirms the final copy (GU-2).
- **New BETA-JOIN-7 (auto, P0):** **Given** a signed-in user, **When** they tap "Delete my account" and confirm, **Then** they are signed out, `my_spaces` returns `[]`, and a deletion request is recorded. This is pulled forward from "Not now" because Beta App Review expects in-app account deletion.
- **New BETA-OPS-1 (auto, P0, Ring 0):** **Given** a thrown error in the app, **When** it is reported, **Then** exactly 1 `client_errors` row is written with app version, OS and screen, and no caption, email, URL or key. The app has 0 third-party analytics or crash SDKs.
- **Notification sending is P0 for Ring 0** (NOTIFY-2, NOTIFY-4, REPLY-3 are auto P0s). It wasn't built in the backend lane. Owner: app-engineer (AE-2).
- **GRANDPARENT-GUIDE.md** must stop saying "nothing to download". The beta requires installing the app (GU-3).

## Milestone map and trace (Oct 16, staff-pm)
`ANCHORS.md` milestones supersede the ring gates above (kept for history). **M** = first milestone that needs the criterion (1 Chase end to end · 2 Danielle, both sides posting · 3 savvy relative · 4 everyone else · 5 Android · 6 frame · 7 decide). **Trace** = the story problem or anchor it serves (A1 Anxiety-less, A2 Guilt-free, A3 US soil). No criterion or built feature is deleted.

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
| SHARE-6 | 4 | Video is worse; stepmom sent separately, in-laws offended | Deferred (Oct 15). **Note:** strong story trace, not a nice-to-have |
| SEE-1 | 1 | A1 | |
| SEE-2 | 4 | Viewing built for WV; slow old phones | |
| SEE-3 | 1 | Viewing built for WV; no gesture-only actions | |
| SEE-4 | 4 | Big photos for WV grandparents (photo half) | Video half deferred |
| SEE-5 | 3 | Grandparents print photos; A1 (no location in the saved file) | |
| SEE-6 | 1 | A1: divorced sides; removal is real | |
| AUD-1 | 2 | Grandma A without Grandpa B, "and without worrying that he might"; A1 | |
| AUD-2 | 1 | A1: never post to the wrong side by default | |
| AUD-3 | 1 | Grandma A / Grandpa B on every path; A1 | |
| AUD-4 | 1 | Split families; A1 | **Flag:** the co-parent case is the Rob persona, not Chase's story (his split is among grandparents). Built and green; keep |
| AUD-5 | 1 | A1 | |
| AUD-6 | 3 | A1: a wrong audience can be fixed | Moved 2→3 (Oct 16 review): no app UI yet; delete + repost covers M2 |
| NOTIFY-1 | 2 | Guilt: photos actually reach grandparents | |
| NOTIFY-2 | 1 | A1; A3 (alerts transit Apple/Google with no photo, caption or child's name) | |
| NOTIFY-3 | 1 | Viewing built for WV | |
| NOTIFY-4 | 3 | A1 (Kim: no buzzing) | |
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

### New criteria (Oct 16)
| ID | Type | Pri | M | Given / When / Then |
|---|---|---|---|---|
| BETA-NOTIFY-7 | auto | P1 | 1 | **Given** any push, sign-in email, digest or invite text, **When** it is generated, **Then** it names the real sender ("From Chase on Hearth" / "Chase invited you to Hearth"), never a generic "You have a new notification", and still carries no photo, caption or child's name. |
| BETA-REPLY-6 | auto | P0 | 1 | **Given** a member about to comment on a post, **When** the comment box is shown and after Send, **Then** the screen says in words who will read it, matching what the server actually allows (today: "Everyone this photo was shared with can read this"), and never implies only the poster will (the current "Sent. Chase will see it." fails). |
| BETA-AUD-7 | auto | P0 | 1 | **Given** any member, **When** they call any RPC or table they can read, **Then** no other member's last-active, last-login, online status or device details come back. (Does not decide NOTIFY-6.) |

### Product review, Oct 16 (staff-pm, screens read, not run)
- **Danielle as a poster (M2):** the backend allows owner-only `adult` invites and adults manage every group; the app's Invite button only makes `viewer` invites and there is no "new group" button. For M2, Claude seeds Danielle's adult invite and both sides' groups by SQL from Chase's list. No setup UI (still "Not now").
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
| 2: Danielle | Danielle joins as a poster (adult) and passes JOIN-2 and SHARE-1 unaided (stopwatch); both post to both family sides' groups with 0 cross-side leaks; AUD-1 2 of 2; NOTIFY-1 p90 ≤ 60 s over ≥10 posts; 0 open P0 | Test Log times; latency log; ticket list |
| 3+ | Defined when M2 passes. Grandparent test (above) is the M4 entry check; A2 "Seen by" decided before M4 | |
