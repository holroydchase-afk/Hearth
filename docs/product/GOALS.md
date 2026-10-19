# Hearth product goals

Owner: staff-pm. Written Oct 18, 2026, from Chase's ask: "I want a highly intuitive flow that does what it needs to. We need a list of product goals: one being blow the end user away in the first three sessions. Remember non tech savvy rural Grandparents. I think a lot of tech folks will have moved from rural areas."

Scope and tests stay in `docs/product/BETA-SPEC.md`. This file adds no features. IDs marked *proposed* are measurements to add to BETA-SPEC on Chase's word, not things to build. Ideas go to the ANCHORS ideas log.

## The two people every goal serves

- **The grandparent who stayed.** Rural WV, older or budget phone (every grandpa is on Android), spotty signal, scam-wary, "just show me the babies". Real people: Gammy, Grandaddy, Grandmomma, Memaw, Pawpaw, Granny; the great-grandparents later.
- **The adult child who moved away.** Chase's insight: the tech-savvy relatives are often the ones who left. Chase is in Charlotte; Mom's sister is in Texas. They invite and set up, from hundreds of miles away. STORY: "Like a lot of America, we live far from our hometown."

**What distance means.** Nobody is in the room. Setup happens over a phone call where the helper can't see the screen. So:
1. The invite text must work on its own, from a named person ("Chase invited you to Hearth", NOTIFY-7).
2. Every step must be readable aloud: big, unique words on each button, so "tap the button that says See the photos" works over the phone. No icon-only buttons, no gestures (rule 3).
3. Every error says what to do next and who to call ("Ask Chase for a new one").
4. The grandparent must never land on an empty screen and think it's broken (ONB-10).

## Goals

| # | Goal | What it means | For | How we know (signal) |
|---|---|---|---|---|
| G1 | **Blow them away in the first three sessions** | Each of the first three visits has one moment that beats the group text, with no help | Grandparent and inviter | Session table below; 0 help calls across sessions 1–3; Chase's one phone question after session 3 (GOAL-WOW-4) |
| G2 | **No help needed, on the oldest phone in the family** | A rural grandparent finishes every core task alone on an old Android on slow signal | Grandparent (June stand-in: least savvy, Chase to name) | Grandparent test 4 of 5 testers, every task under 60 s; JOIN-2 / ONB-9 first photo in 2 min; SEE-2 and SEE-3 run on the oldest phone (*proposed* GOAL-OLD-1); SHARE-5 same 2048 px photo on every phone; help calls logged on the Test Log, target 0 |
| G3 | **Set up from far away** | The adult child invites and talks a grandparent in by phone, without seeing their screen | Inviter who moved away | JOIN-6 passes with the helper in another state (*proposed* GOAL-REMOTE-1: phone call only, no visit, no screen sharing, under 10 min); ONB-3/4/5 links work from a text or email; ONB-10 no empty first screen; NOTIFY-7 every message names the sender |
| G4 | **Nobody wonders who saw it** | Every post, comment and heart says in words who can see it, and nothing shows who looked or didn't (A1, A2) | Inviter (A1), every relative (A2) | AUD-1 3 of 3; AUD-3, AUD-14, AUD-7 green; REPLY-6 / REPLY-11 words match the server; no per-person "seen" shown to family (NOTIFY-6 decided before M4) |
| G5 | **Does what it needs to, nothing else** | Six jobs done well: Get in, Share, See, Choose who sees it, Hear about it, Say something back. Sharing to Everyone is the fastest path ("90% of the content we post will be to everyone") | Inviter and grandparent | Every screen traces to a BETA-* ID (trace table); SHARE-1 3 taps; AUD-17 Everyone is 1 tap; nothing in "Not now" built without a staff-pm call; grandparent screens add no buttons beyond the six jobs (grandparent-ux check per build) |
| G6 | **Promises that hold up to a tech reader** | Every privacy claim (stored in the US, encrypted, location stripped, no AI training, no ads) is true today and checkable in the docs and code (A3, A4) | Inviter (the privacy-minded parent who picks Hearth) | SHARE-2, SHARE-3, CF-10 CI grep green; `docs/architecture/` "Last checked" current for each PR that moves data (rule 6); public wording stays "stored in the US" until the A3 gaps close |

## G1: the first three sessions

One moment per session. If that moment doesn't land, the session failed, whatever else worked.

### (a) The grandparent who stayed

| Session | What it should feel like | The one moment | Signal |
|---|---|---|---|
| 1. Getting in | A text from Chase, one tap, and the grandkids are there. No password, no account, no form | **The first photo of the grandkids fills the screen, sharp, within 2 minutes** | JOIN-2 / ONB-9 stopwatch ≤ 2 min; ONB-10 (not empty); 0 help calls |
| 2. Coming back | A notice from a named person; tap it and the new photo is right there. Still signed in, nothing to remember | **"From Chase on Hearth" taps straight to the new photo, no code asked** | NOTIFY-3, JOIN-5, NOTIFY-7; *proposed* GOAL-WOW-2: opened from a notice within 3 days, unprompted (Chase-only total, never shown per person, A2) |
| 3. Saying something back | She talks to her family about the photo, and knows exactly who reads it | **She hearts or comments, and the screen tells her in plain words who will read it (her house and the parents, not the other side)** | REPLY-5 under 60 s; REPLY-6 / REPLY-7 words match; *proposed* GOAL-WOW-3: first reply unprompted by session 3 |

### (b) The adult child who moved away

| Session | What it should feel like | The one moment | Signal |
|---|---|---|---|
| 1. First share and invite | Post once instead of five group texts, then invite Mom by text from 300 miles away | **One post to Everyone, 3 taps, and the screen says who gets it ("Everyone · 11 people")** | SHARE-1, AUD-17, AUD-1; invite made and texted in under 2 min (ONB-5) |
| 2. It reached her | Proof Grandma got it, without calling to ask "did you get the photos?" | **Grandma's heart or comment arrives within a minute** | REPLY-3 ≤ 60 s. Deliberately not "Seen by" (A2) |
| 3. The hard post | The post that used to mean a separate text: only Mom's dad's side, or only the people at the Charleston trip | **Posting to one side or one event and trusting it, because the screen says who sees it and who doesn't** | AUD-17, AUD-18, AUD-1 3 of 3; 0 leaks (AUD-3, REPLY-7..9) |

**GOAL-WOW-4 (*proposed*, manual).** After a relative's third session, Chase calls and asks one question: "Would you go back to the group text for photos?" Log the answer word for word on the Test Log. Met when every M3–M4 relative says no without being led, and 0 help calls were logged across their sessions 1–3.

## Tensions with existing anchors and spec

1. "Seen by N of M" (NOTIFY-6, CF-20) is the cheapest inviter wow but breaks A2; G1 uses a returned heart (REPLY-3) instead. Decision still due before M4.
2. STORY's "Setup is a family event: a printed guide, a local helper, and a number to call" assumes someone nearby; Chase's insight says the helper is usually far away. STORY should be updated on Chase's word.
3. Installing a beta app (TestFlight) over the phone is the hardest remote step, and the web viewer is "Not now" in BETA-SPEC. The invite web page (ONB-4) already exists; keep it Not now until the phone survey or M3 shows someone stuck.
4. SEE-2 is timed on "a mid-range phone"; G2 asks for the oldest phone in the family. Changing the test phone is a test change, not scope.
5. Session 1 for grandparents depends on the email code trip (where most of the 2 minutes go) until text sign-in (ONB-11) lands at M4.

## Ideas (for the ANCHORS ideas log, not scope)

- **"Step 2 of 3" on every setup screen**, so a helper on the phone can ask "what step are you on?"
- **"See what Mom will see"**: the inviter previews the invite and first screen on their own phone before sending.
- **A first photo waiting at invite time**: the inviter picks one photo when making the invite, so session 1 is never empty (stronger than ONB-10's reminder).
- **A texted picture guide** in place of (or as well as) the printed guide, since the helper isn't there to hand it over.
- **"The one who moved away" as a named persona** in PERSONAS.md (Chase, Mom's sister in Texas).
