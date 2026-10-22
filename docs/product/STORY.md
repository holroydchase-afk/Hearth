# Hearth story, problems and family stories

Why Hearth exists, in Chase's words, plus the problems it solves and the family stories behind them. Milestones, anchors (A1–A3) and the ideas log live in `docs/product/ANCHORS.md`. Mirrored from the claude.ai doc **Hearth Story & Anchors** on Oct 16, 2026; this file is now the source of truth.

## Why Hearth exists

Hearth exists so parents can share their kids with every part of a complicated family without anxiety, guilt, or risk to the kids.

**Distributed families** (Chase's term, Oct 16): families spread across households, places and generations: divorces, remarriages, stepparents, new partners, living far from the hometown. Use this term in docs and copy.

**Who we build for** (Chase, Oct 16): "we want to build for all family types, optimized for highly complex families." A simple family must still find Hearth simple; a highly complex family must find it safe.

**How most posts go** (Chase, Oct 16): "for us 90% of the content we post will be to everyone." Sharing to everyone must be the fastest path; picking a narrower audience is the exception.

**The family it was built for.** I'm from West Virginia, where about 25 of my family members still live. I live in Charlotte now. My mom's parents are divorced and remarried. My parents are divorced and remarried. My wife's family, from Charleston, WV, has about the same amount of divorce and separation. People who won't sit in the same room certainly won't comment on each other's photos of the grandkids.

**What that looks like today.** We keep at least 5 group texts. Grandma A should be able to comment on a photo without divorced Grandpa B seeing it, and without worrying that he might.

- Every grandpa has an Android and everyone else has an iPhone. Somebody doesn't get the photo, or gets a blurry one.
- Videos are worse. In a 5-person chat with 1 Android, the video arrives degraded. So I send it to my stepmom separately and hope nobody feels slighted. With my in-laws, they do.
- Underneath it all is guilt. Like a lot of America, we live far from our hometown. Getting a "good enough" amount of the kids to the grandparents is hard, and the barriers make it harder.

**Why not social media.** Mom and I don't post our kids online, and neither do many of our peers. The risks are real: deepfakes, predators, stalkers, AI trained on our children, ads, and more. Family photos belong with family.

**The feeling we want.** It should feel like the preschool app. Parents know it's secure and that only people they trust are in it. They stop thinking about it and just share.


## Problems and solutions

Eight problems, each with Hearth's answer. Two are only partly solved for the beta.

| Problem | Hearth's answer | Status |
| --- | --- | --- |
| **Split families, 5+ group texts.** Grandma A can't comment without Grandpa B seeing it | Post once and pick the groups. Comments are visible only to that post's audience. Viewers never see group names or that other groups exist. Co-parent households are fully separated | Beta (backend tested); co-parent setup UI in v1.0 |
| **Kids' privacy.** Deepfakes, predators, stalkers, AI training, ads | Invite-only, nothing public. Encrypted before upload. Location stripped on the phone. No AI training or ads, in writing. AI helpers are off until a parent turns them on, and run only on the phone (DEC-31) | Beta. Keys are server-held, not end-to-end |
| **iPhone vs Android photos.** Missing or blurry | Native apps on both. Same 2048 px photo for everyone. No MMS | Beta |
| **Video anxiety.** Android relatives get degraded video, so you re-send it and worry about who feels slighted | One upload, same quality for every phone | **Not in beta.** iOS video location can't be stripped yet. v1.0 (CF-17) |
| **Parental guilt over distance.** Hard to share "enough" with grandparents far away | Sharing in 3 taps. One notice per post, so you can share often without spamming | Beta. Picking the best of 30 is an open AI question |
| **Guilt and judgment between relatives** | No visible engagement tracking (anchor A2) | **Open.** "Seen by" conflicts; decision needed |
| **Grandparents who aren't techy or are rural** | No passwords. Big text and buttons, plain words, "Call Chase" on Help, printed setup guide | Beta. Non-app access for people like Earl is v1.0 (CF-18) |
| **Social media itself.** Filters, likes, strangers | No filters, public profiles, ranking, or ads. US-stored data | Beta |


## Family stories, as told

These are the stories Chase has shared in this project and related chats. The personas (June, Earl, Linda and the rest) are composites, not real relatives.

| Story | What Chase said | Why it matters for Hearth |
| --- | --- | --- |
| Divorce across generations | Mom's parents divorced and remarried. Chase's parents divorced and remarried | Up to 3 generations of separate households want the same photos |
| Mom's side | About the same level of divorce and separation. Mom was born in Charleston, WV | Two families' worth of households, not one |
| 5+ group texts | Relatives won't sit in a room together, let alone comment on each other's photos | The core use case: comment without being seen by the other side |
| Birthday at Gigi's | "We had a birthday party at Gigi's house. My dad's side was there, Mom's dad's side was there. I'd want to only post to those groups." | Some posts belong to an occasion: share with the people who were there (the events idea) |
| The Charleston trip | "Mom's dad and stepmom and her sister (who lives in Texas) were all together with us in Charleston, WV. That would be a natural group." (Oct 17) | A natural group crosses households and states: Pawpaw and Granny's house plus a sister in Texas. Hearth must combine households from different places, not only follow a strict family tree: this is an event (`docs/product/SPEC-GROUPS.md` §3) |
| The stepmom workaround | Sends videos to his stepmom separately and worries about offending his dad. With the in-laws, people really do get offended | Video quality turns into a family relationships problem |
| Android grandpas | Every grandpa has an Android; everyone else has an iPhone | Cross-platform quality is a must-have |
| No kids on social media | Chase and Mom don't post the kids, and neither do many of their peers | Privacy is the reason to switch, not a feature |
| WV roots | About 25 family members in WV. Several great-grandparents and grandparents were born there | The first users are rural WV relatives |
| Distance | Chase lives in the Charlotte area and once weighed moving back to Charleston, WV to be near family. He stayed, and moves to North Carolina in 2027 | Distance is why sharing "enough" feels hard |
| Home life | Stay-at-home dad with young kids; Mom works remotely | The founder is the target parent, and time is short |


## West Virginia vs Charlotte tech culture (inferred)

Hearth's design target is the WV side; the Charlotte side is who posts. Everything below is Claude's inference from Chase's stories and general knowledge, not research. Check it against the phone survey (CH-4).

|  | Rural WV family | Charlotte-area family |
| --- | --- | --- |
| Phones | Older or budget Androids, some flip phones, an old iPad | Recent iPhones |
| Connection | Spotty LTE, DSL, dead zones | Fast and constant |
| Online habits | Facebook as "the internet," mostly to see grandkids. Old Yahoo or AOL email checked every few days | Many apps, comfortable with new ones, and a lot of parents have quit social media |
| Trust | Scam-wary. Calls family instead of reading instructions | Privacy-literate; worries about AI, data, and exposure |
| Help | A local helper (a Tammy) and Sunday visits | Self-serve |
| What they want | "Just show me the babies" | Control, privacy, and proof it worked |

**What it means for design**

1. Posting is built for Charlotte; viewing is built for WV. Two different bars.
2. Assume a slow, old phone: small files, words on every spinner, and nothing that needs a fast connection.
3. Every message names a real person ("From Chase on Hearth") so it can't pass for a scam.
4. Setup is a family event: a printed guide, a local helper, and a number to call.
5. Someone will never install an app (Earl). Plan a non-app path for v1.0 (CF-18).

Ideas waiting on a decision: see the Ideas log in `docs/product/ANCHORS.md`.
