# Lessons learned

One entry per post mortem, newest first. Each entry gives what happened, why, and the rule or guard that now prevents it. Every agent follows the rules here.

## Oct 18, 2026: Hearth wouldn't open in Expo Go (SDK 54 vs 57)

Full post mortem (Claude Doc): https://claude.ai/code/artifact/730d2640-da97-4612-a22a-86abd9493f84

**What happened.** The first time Chase opened Hearth on his iPhone, Expo Go refused it: "The installed version of Expo Go is for SDK 57.0.0. The project you opened uses SDK 54." App Store Expo Go runs only the newest SDK and can't be downgraded. Hearth had been on SDK 54 since its first commit on Oct 16. SDK 54 came out Sep 10, 2025, and SDK 57 came out Jun 30, 2026, so we started three versions behind. Expo did not move during our build. PR 24 upgraded the app to SDK 57.

**Why.** The SDK was chosen from Claude's memory, not from Expo's current release. A reasonable "keep 54 for iOS 15.1" note in BETA-SPEC and REMAINING (CH-4) kept it there. That note never noticed that Expo Go had already dropped SDK 54. The Oct 16 Expo Go readiness check compared our packages with our own SDK, without a phone. Three EAS Updates were published, and none was opened on a phone.

**Rules from now on.**
1. **Look up versions, never recall them.** Before choosing or pinning a version of an SDK, runtime, library or service, check the vendor's live release page or registry. Write the date checked next to the choice.
2. **Check against where it runs.** A readiness check names the real target (App Store Expo Go, a specific phone, a hosted service) and checks against that, never against our own config.
3. **Opened on a phone, or not done.** A build Chase is meant to try is "ready" only after a real phone opened it, or after a check that proves the phone can open it (EXPO-4 below).
4. **Raise conflicting constraints at once.** When two requirements can't both hold, such as "iOS 15 support" and "runs in Expo Go", put it to Chase as a decision right away.

**Guards in the repo.**
- `scripts/check-expo-go.sh` (EXPO-4) compares `app/package.json`'s Expo SDK with `expoGoSdkVersion` from Expo's public API (api.expo.dev/v2/versions). CI's "Expo Go runs our SDK" job and `test-all.sh` run it. CI goes red on its own when Expo ships a new Expo Go. That is the alarm, not a flake: upgrade the SDK.
- `app/scripts/eas.sh update` runs the same check first and refuses to publish an update that Expo Go can't open.
- Tests: `scripts/tests/check_expo_go_test.sh`, `app/scripts/tests/eas_test.sh` (EXPO-4 cases).

**Platform fact.** iPhone Expo Go supports only the newest Expo SDK (Android Expo Go too, in practice). SDK 56 and later need iOS 16.4+, so iPhone 7, 6s, SE (1st gen), iPad mini 4 and iPad Air 2 can't run Hearth.

## Oct 19, 2026: a guessed Expo Go link didn't open

**What happened.** Chase asked for one link that always opens the newest Hearth in Expo Go. Claude built `exp://u.expo.dev/<project>?channel-name=preview` from Expo's usual URL pattern and sent it without trying it. Expo answered 404: the project had a `preview` branch but no `preview` channel. Claude created the channel (`eas channel:create preview`, linked to the branch), and the same link then served the latest update.

**Why.** The same mistake as Oct 18: an answer from memory of how a tool usually works, not from checking this project. Rule 3 above covered builds but not links.

**Rule.** Anything Chase is asked to click, paste or type (a link, a code, a command) is tried first, or the message says plainly that it is untested. For an Expo Go link, fetching its manifest is enough: `curl -s -o /dev/null -w '%{http_code}' -H 'expo-platform: ios' -H 'expo-runtime-version: exposdk:<sdk>' 'https://u.expo.dev/<project>?channel-name=preview'` must print 200.

**Standing link.** `exp://u.expo.dev/676e8cec-57a6-472f-9086-9a9318eaf556?channel-name=preview` opens the newest update on the `preview` branch (checked Oct 19: 200 for iOS).
