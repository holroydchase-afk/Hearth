# PM review: BETA-PLAN-draft (Oct 15, 2026)

**Verdict: the Nov 22 target holds, but the draft's dates don't.** Building a full Expo app in one weekend is fiction, and grandparents can't use TestFlight internal testing at all. Move the Ring 0 gate to Thu Oct 29, schedule Beta App Review, and cut the web fallback, co-parent UI, and paying-intent signal from the beta.

## What's wrong
1. **Sat–Sun build of the whole app isn't realistic.** No `app/` exists yet. The weekend list covers deep-link sign-in, feed, viewer, share with resize, EXIF strip and client-side AES, and the audience picker, followed Monday by push, email, Seen by, and retry. That's 2 weeks of agent work at minimum. On a $20 plan you'll hit usage limits mid-session, and every fix has to fit into kids' nap time. Plan on 8–10 working days, run one lane at a time, and assume half the days get interrupted.
2. **TestFlight internal testing doesn't reach anyone past your wife.** Internal testers must be users on your App Store Connect team (max 100) and skip review. External testers need no account (up to 10,000), but the first build of every version needs Beta App Review ([Expo TestFlight docs](https://docs.expo.dev/submit/testflight/)). The draft never schedules that review. Hearth is invite-only, so the reviewer also needs a demo login. Submit the first external build during Ring 0 so approval is done before Ring 2.
3. **Apple enrollment is the critical path, not a Friday errand.** Apple's profile page says up to 48 hours. Forum reports from individuals run 5 days to 3+ weeks ([thread](https://developer.apple.com/forums/thread/844653), [one week](https://developer.apple.com/forums/thread/827293), [3+ weeks](https://developer.apple.com/forums/thread/817247)). Enroll tomorrow morning. Build Android-first in the meantime: Play internal testing needs no review and reaches testers "within minutes".
4. **Play internal testing: plan for the email list.** It allows up to 100 testers per app, who must be on an email list, and each Android grandparent needs the Google account on their phone to be on that list ([Play help](https://support.google.com/googleplay/android-developer/answer/9845334)). The 12-tester / 14-day closed-test rule gates production only, not the internal track ([Play help](https://support.google.com/googleplay/android-developer/answer/14151465)), so it doesn't block the beta.
5. **Old phones can decide scope.** The current Expo SDK supports Android 7+ and iOS 16.4+. SDK 54/55 support iOS 15.1+ ([Expo versions](https://docs.expo.dev/versions/latest/)). iOS 16.4 excludes iPhone 7 and older, which grandparents still carry. Collect a phone inventory (model, OS, email) for all 12 this week. It decides which SDK we pin and whether anyone needs a web viewer.
6. **The Supabase pause matters less than missing backups.** Free projects pause after low activity over 7 days and can be restored for up to a year ([Supabase docs](https://supabase.com/docs/guides/platform/free-project-pausing)). Daily ring use prevents the pause. The real problem is that the free tier has no backups (backend/README). Move to Pro before Ring 2 (the first relatives' photos), not Ring 3.
7. **Mis-sequenced:** the master-key backup has to happen before Ring 1 (your wife's real photos), and you need to test a restore, not just write the key down. The name and trademark check has to come before buying the email domain. The guide gets mailed by Nov 10, not drafted Oct 22.
8. **Missing items:** Beta App Review prep (demo account, beta description, privacy policy URL, feedback email), a sending domain with SPF/DKIM/DMARC for Resend, crash evidence (TestFlight and Play vitals only, with no third-party SDKs, per engineering rules), the phone inventory, a help-call log, and a fallback date.

## Gates aren't measurable
| Draft gate | Problem | Replace with |
|---|---|---|
| "she shares without asking how" | No task, no clock | BETA-SHARE-1 manual run: done unaided in under 60 s |
| "push within 1 min 9/10" | No measurement method | Server `created_at` vs device receipt log, ≥10 posts, p90 ≤ 60 s |
| "no privacy surprises for a week" | Unfalsifiable | 0 open P0, and all BETA-AUD auto tests green on the hosted stack |
| Ring 2 "grandparent test passes" | Ring 2 has 1 grandparent; the test needs 5 | 5 testers aged 65+ (neighbors and church count), 4 of 5 pass |
| Ring 3 gate = success signals | Those are outcomes, measured after Nov 22 | Ring 3 exit: 10 of 12 signed in and opened at least 1 post by Nov 22 |
| "3+ families pay $39.99" | Grandparents aren't the payers; untestable by Nov 22 | Cut from the beta. Ask parents after Thanksgiving. |

## Cut (details in BETA-SPEC "Not now")
Web fallback viewer (unless the inventory shows a phone that can't run the app), co-parent setup UI (backend tests stay), change audience after posting (delete is the P0 remedy), true background upload (retry on reopen is enough), and invite-status management (Chase resends by hand).

## Recommended rings (replacement)
- **Build: Oct 16–27.** Core loop against local, then hosted, Supabase. Android-first if Apple is still pending.
- **Ring 0, Chase alone: Oct 28 – gate Thu Oct 29.** All P0 auto criteria green 3× on the hosted stack, and S9, S10, S16 closed. ≥10 posts over ≥2 days, 0 lost (sent count = received count on the test account), 0 crashes in TestFlight or Play vitals. Key restore tested. External build submitted.
- **Ring 1, + wife: Oct 30 – gate Thu Nov 5.** Your wife passes JOIN-2 and SHARE-1 unaided. Push p90 ≤ 60 s over ≥10 posts. 0 open P0. Beta App Review approved. Supabase Pro on.
- **Ring 2, 3–5 family incl. 1 Android and 1 grandparent: Nov 6 – gate Thu Nov 12.** Grandparent test 4/5 pass (5 testers aged 65+). The Android user installs from the Play link unaided in under 10 min. 0 open P0/P1. A digest reaches the inbox at Gmail, Yahoo/AOL, and Frontier.
- **Ring 3, WV grandparents: Nov 13–22.** Guide mailed Nov 10. Setup calls over the Nov 14–15 weekend. Exit: 10 of 12 signed in and opened at least 1 post.
- **Fallback:** if the Ring 1 gate slips past Nov 9, Ring 3 becomes in-person setup at Thanksgiving (Nov 26).

## Recommended next 7 days (replacement)
- **Fri Oct 16.** Chase: Apple enrollment (first thing), Supabase (East US), B2 (US East), Expo, Play Console ($25), name check. Text the family for the phone inventory. Agents: qa-tdd writes failing tests for every P0 auto criterion; privacy-security fixes S9 and S10; QA runs S16 on local Supabase.
- **Sat–Sun Oct 17–18.** app-engineer: Expo skeleton, JOIN-1/3 (invite link plus emailed 6-digit code), SEE-1/2 feed. Chase: 20 min of screenshots.
- **Mon Oct 19.** SHARE-2/3/5 (resize to 2048 px, EXIF strip, encrypt, upload) and the AUD-1/2 picker.
- **Tue Oct 20.** SHARE-4 retry, SEE-3 viewer, AUD-5 delete.
- **Wed Oct 21.** Deploy to hosted Supabase and B2. Chase backs up MEDIA_KEK offline and tests a restore. First Play internal build.
- **Thu Oct 22.** Push (NOTIFY-1/2/3), REPLY-1/2/3. grandparent-ux runs a Dynamic Type pass. Run M-01 on the prototype with one older neighbor. First TestFlight internal build if Apple has approved.
- **Fri Oct 23.** No gate. Ring 0 gate review is Thu Oct 29.
