# Case study: Hearth (working name)

**Role:** founder and product manager, solo, with a team of Claude agents. **Timeline:** started Oct 15, 2026. Within a week the app ran on the founder's own phone. **Stack:** Expo, Supabase, Backblaze B2.

## The problem

Chase's family is "distributed": divorces, remarriages, step-grandparents, relatives spread between rural West Virginia and Charlotte. Photos of the kids reached some grandparents and not others. They got lost in text threads, or sat on social networks that half the family refuses to join. The real requirement wasn't another photo app. It was **control over who sees each photo, simple enough for a great-grandparent, private enough for a skeptic.**

## Five calls that shaped it

**1. Milestones named after people, not phases.** A startup-style plan (gates, funding, pricing) was dropped on day two. Instead the milestones are: the founder, then his spouse, then the most tech-comfortable relative, then everyone else in order of comfort. Each milestone has one real person who can say yes or no. Pricing and legal wait until there's proof anyone wants it.

**2. Delete the model that was built yesterday.** A fixed family tree (sides, households, events) was specced, built and deployed. Then one real relative turned out to belong in two households. The tree went, replaced by plain named groups that anyone can be in more than once. Less to explain, and it covers every case.

**3. Measure feelings, not just engagement.** "Seen by 3 of 8" is a standard feature. In a family it's a guilt meter: it counts who didn't look. It was cut, and a heart now proves a photo arrived without shaming anyone. Each feature is checked against four anchors: anxiety-less, guilt-free, stays on US soil, white-paper ready.

**4. Claim only what's true today.** The app promises "stored in the US", not "never leaves the US", because push notifications and vendor support cross borders. A claims register lists what marketing may say and why it's true. The audience is privacy-literate and will check.

**5. Test-driven product management.** Engineers write the failing test first. Hearth does the same for product calls: every decision gets one Green or Red row per relative persona, from the great-grandparent who won't install anything to the cousin who will. A Red needs a mitigation or an explicit override, and CI fails if the check is missing.

## How the work runs

- **An agent team with lanes:** staff PM, QA, app engineer, UI/UX designer, privacy and security, marketing and funding. The founder writes goals and makes calls. Agents work one lane at a time, test-first, and open pull requests. Nothing merges without the founder's word.
- **Night shift:** before bed, one instruction schedules an unattended 2:15am run. On the first night it reviewed the app from the code, ranked 14 items, and shipped parallel uploads, a fix for the photo framing the founder had reported, and a cipher switch. It also checked the messenger's encryption against the RFC 9180 test vectors.
- **Decision log:** 29 decisions, each with what it beat and why. That makes the story retellable and reviewable.

## Results so far

- The core flow works end to end on a phone. You sign in with a 6-digit code, pick photos and choose who sees them. Relatives heart and reply, and email notices arrive.
- 596 app tests, 639 database checks, contract tests against both a fake and the real backend, and web end-to-end tests.
- Privacy built in from the start: location and camera data stripped on the phone and verified, photos encrypted on the phone, end-to-end encrypted group chat (MLS), and access rules enforced in the database.

## What's next

Milestone 2, the founder's spouse. Built on the first night shift: Photos that open instantly and offline from encrypted copies on the phone, and no-AI photo helpers that leave out repeats, screenshots and look-alikes (each one button from coming back). Still to come: native encryption in the app's own build, and blur detection once it is tuned on real photos.
