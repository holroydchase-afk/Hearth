# Hearth marketing and positioning

Owned by the `marketing` agent. Chase logs positioning, messaging, audience and channel ideas here; the agent sharpens them. Product ideas also go in `docs/product/ANCHORS.md`. Nothing here is public copy until Chase says yes and the claims register backs it.

**Stage:** proof of concept. No paid marketing, pricing or launch before milestone 7 (`docs/product/ANCHORS.md`). Near-term copy only: invite texts, App Store listing, printed guide.

## Positioning (draft, not adopted)

> For parents in complicated families who don't post their kids online, Hearth is a private family photo app where every photo goes only to the groups you pick. Unlike group texts or social media, nobody sees who else is in the family, nobody is judged for how often they look, and your kids' photos are stored in the US and never used to train AI.

## Message pillars (from the anchors)

| Pillar | Anchor | Problem (STORY.md) | One line (draft) |
|---|---|---|---|
| Post once, pick who sees it | A1 | Split families, 5+ group texts | One photo, the right people, no awkward group chats. |
| Feels like the preschool app | A1 | Kids' privacy | Only people you invited. Nothing public, ever. |
| Nobody keeps score | A2 | Guilt and judgment between relatives | Share when you can. Look when you can. |
| Stays in the US | A3 | Kids' privacy | Your kids' photos are stored in the US. |
| Same photo on every phone | — | iPhone vs Android | Grandpa's Android gets the same sharp photo. |
| Built for Grandma | — | Non-techy / rural grandparents | No passwords. Big buttons. Call Chase. |

## Claims register

Say only what's in **True today**. Update when the code or vendors change.

| Claim | Status | Notes |
|---|---|---|
| Invite-only; nothing public | True today | |
| No ads, no AI training, no trackers | True today | "Never build" in CORE-FEATURES.md; keep it in writing |
| AI is off until your family turns it on. Then it runs only on your phones, and your photos never train anyone else's AI | True today (no AI has shipped) | DEC-28, Oct 19. Re-check when the first AI add-on ships. "No face scanning" is **retired**: don't use it, since face suggestions are planned (AI-1 phase 2) |
| Location stripped on the phone | True today (photos) | Not video; video isn't in beta |
| Encrypted before upload | True today | Keys are server-held. Never say "end-to-end" |
| Stored in the US | True today | Supabase East US, Backblaze US East |
| Never leaves the US | **Not yet** | Supabase auth logs/support and Apple/Google push transit. See ANCHORS A3 gaps |
| Same quality on iPhone and Android | Photos: true today | Video: future (CF-17). Android app is milestone 5 |
| Nobody can see if you've looked | **Not yet** | "Seen by N of M" conflicts with A2; decision pending |
| Comments stay private to the right people | Partly | Comments are seen by the post's whole audience today |
| No AI on your photos | True today | Hearth runs no AI on media at all. Say this, not "AI is optional" (that implies AI features exist). Re-check after the AI positioning session |
| Personal / private server for your family | **Not built** | Undefined (self-host vs per-family store). Never claim. ANCHORS ideas log, staff-pm owns. Don't use Discord as the model: a Discord "server" is a space on Discord's shared cloud, and its text isn't end-to-end encrypted ([TechRepublic](https://www.techrepublic.com/article/news-discord-dave-end-to-end-encryption/), as of Oct 17, 2026) |
| "Signal-level privacy" / "end-to-end encrypted" / "not even we can see your photos" | **Not yet** | Hearth holds the keys (MEDIA_KEK wraps each photo's key on the server). True only after the E2EE step in "Privacy-first path". Captions, names and replies are stored readable by Hearth today |
| "Only app that lets you pick who sees each photo" | **False** | FamilyAlbum Premium has Share Groups (as of Oct 17, 2026). Say what's ours instead: households, hidden groups, scoped replies, once SPEC-GROUPS ships |
| "Unlike X, Hearth is end-to-end encrypted / more private than Ente" | **False** | Ente is E2EE, open source and audited. Never compare on encryption |
| "Unlike FamilyAlbum, your photos stay in the US" | **Unverified** | FamilyAlbum is run by MIXI (Tokyo, Japanese law); its storage location wasn't found. Don't name them on A3 until verified from their policy |

## Audiences

| Audience | Why they care | Where they are (to verify) |
|---|---|---|
| Parents in split or blended families | 5+ group texts, slighted relatives | — |
| Parents who don't post kids online | Privacy, AI training, strangers | — |
| Grandparents who avoid social media | Want photos, not Facebook | Reached through their kids, not directly |
| Co-parents | Separate households, no overlap | — |
| Privacy-aware parents (tech-savvy, read the news, often called "overprotective") | They read the policy and the breach stories; they're usually the one who picks the family's app | Developer and privacy communities; to verify. They choose, grandparents use |

## Name candidates (Oct 17, 2026; not adopted)

Not legal advice. These are web and App Store search checks, not a trademark clearance. Run a USPTO Trademark Search (classes 9, 42, 45) on the finalist, and have a lawyer look before launch (milestone 7).

**"Hearth" conflict (as of Oct 17, 2026): serious for branding, unclear legally.**
- Hearth Display: a funded family-organizer screen with an iOS companion app and a $9/mo Family Membership. It sells to the same families and shows photos. [hearthdisplay.com](https://hearthdisplay.com/products/family-membership), [App Store id6498717775](https://apps.apple.com/app/id6498717775), [TechCrunch 2022](https://techcrunch.com/2022/07/12/hearth-display-replaces-your-whiteboard-with-a-27-inch-display-for-family-task-management)
- Hearth: Family Care (iOS, developer John Frank Krueger): shared family photos, voice messages and check-ins for an aging parent. Closest overlap. [App Store id6779768761](https://apps.apple.com/app/id6779768761). Seen only via search snippets; the App Store page didn't load from here
- Hearth (gethearth.com): financing for home contractors. Different market, so low confusion risk, but it crowds search. [gethearth.com](https://gethearth.com/pricing)
- USPTO: I couldn't reach the USPTO database. Aggregator searches turned up only fireplace and hearth-industry marks, plus a 2012 "Hearth Fire" game filing; no live class 9/42 HEARTH software mark showed up. **Unverified.**
- hearth.family: no DNS answer on Oct 17, so there's no live site; the registry (RDAP) was unreachable. **Registration unverified.**

| Name | Why it fits | Live conflict check (Oct 17, 2026) | Candidate domain (availability unverified) |
|---|---|---|---|
| **Homeplace** | Appalachian word: "the home of the heart for many West Virginians," the family's original home ([e-WV](https://wvencyclopedia.org/entries/443)). That's exactly what distributed families scatter from. Easy to say and spell | No app or photo product found. The word is common in home-health and real-estate business names | homeplace.family |
| **Lamplight** | Calm, A1/A2: a light left on, no pressure. Plain word | No family app found | lamplight.family |
| **Fridge Door** | Where grandkid photos have always gone. Very plain and a little playful | No app found. Samsung's "Family Hub" fridge shows photos (generic, different name) | fridgedoor.family |
| Porchlight | Warm and Southern, "we left the light on" | Porchlight family check-in app (2017, Colorado Springs), later healthcare ([KOAA](https://www.koaa.com/news/covering-colorado/local-man-creates-phone-app-to-help-connect-loved-ones)). Moderate | porchlight.family |
| Front Porch | Where family visits happen | Front Porch is a senior-living nonprofit with an app ([CB Insights](https://www.cbinsights.com/company/front-porch)), plus Frontporch Care home care. High in the senior space | frontporch.family |
| Homefolks | Grandparent word for your people | A "home folk" listing on [AlternativeTo](https://alternativeto.net/software/home-folk/) (unclear what it is). Low to moderate | homefolks.family |
| Kinfolk | Plain, Appalachian | No app found, but Kinfolk is a well-known lifestyle magazine brand (not re-verified live). Moderate | kinfolk.family |
| Hearth Family (keeps Hearth) | Keeps the existing work and the `hearth.family` plan | **Doesn't fix the conflict**: the trademark question is about the word "Hearth" for family apps, and Hearth Display already says "Family Membership." Cheapest change if a lawyer clears it | hearth.family |
| Hearthside (keeps Hearth) | Warmer, more distinct than Hearth alone | No Hearthside app found. Still shares the "Hearth" root with both apps above; Hearthside is also a food-manufacturer name (not re-verified). Somewhat better than Hearth Family | hearthside.family |
| ~~Mantel~~ | Where family photos sit | **Dropped:** "Mantel: Family Album" is an invite-only family photo app ([AppGoblin](https://appgoblin.info/apps/6764519748)) | — |
| ~~Quilt~~ | Pieces from many households | **Dropped:** Chatbooks' Quilt is a family photo journal ([App Store id6742336887](https://apps.apple.com/us/app/-/id6742336887)) | — |

### Name shortlist (Oct 19, 2026; Chase's picks, not adopted)

Chase's three: **Fridge Door, Mantel, Hearth.** Not legal advice. Web and App Store search checks as of Oct 19, 2026. From here, apps.apple.com, appgoblin.info, rdap.org and tmsearch.uspto.gov all failed DNS, so **App Store facts come from search snippets, and USPTO and domain availability are unverified.** Nothing bought or registered.

**Live re-checks (Oct 19)**
- **Mantel: Family Album** (Zynclave Tech Private Limited, iOS, free): released May 2026, last update May 8, 2026, **no ratings yet**. Invite-only, admin creates accounts, "no analytics, no advertising, no third-party tracking". Small and new, but it's the same product, the same pitch and the identical word, and it got there first. [AppGoblin](https://appgoblin.info/apps/6764519748). Also: Mantel Group (Australian software consultancy, has apps on Google Play) ([techpartner.news](https://www.techpartner.news/news/mantel-group-acquires-mobile-app-developer-itty-bitty-apps-576770)); a search snippet mentions an open-source family-wall display called "Mantel" (unverified; page didn't load).
- **Mantle (the other spelling; Chase himself wrote "or however you spell mantle", Oct 19):** no family photo app named Mantle found, but a web search for "Mantle" family photo apps **returns Mantel: Family Album first**, so a relative who misspells it lands on the rival. "Mantle" is also Mantle Network, a large crypto Layer 2 with the MNT token ([Coinbase](https://www.coinbase.com/fr-fr/price/mantle), [Delphi](https://members.delphidigital.io/projects/mantle)), and Mantle equity-management software ([WebCatalog](https://webcatalog.io/apps/mantle)). A crypto namesake hurts trust with privacy-aware parents. Both spellings are taken in ways that matter, and we'd need both domains to catch typos.
- **Fridge Door:** no app named Fridge Door, FridgeDoor, On the Fridge or The Fridge found. Nearby: Samsung Family Hub fridges show family photos ([Samsung](https://www.samsung.com/us/support/answer/ANS00083882/)); FridgeArt kids' art scanner (Photomyne) ([AppFollow](https://appfollow.io/ios/fridgeart-kids-art-scanner/1593018307?country=ca)); Infinite Refrigerator, a 2012 iPad app ([Engadget](https://www.engadget.com/2012-12-28-daily-ipad-app-infinite-refrigerator-stores-your-childs-refrig.html)). One mark: **FRIDGEDOOR FOOD TRACKER** (serial 77925527), a magnetic diet tracker, status unknown ([Justia](https://trademark.justia.com/owners/munson-detloff-dawn-1709928)). Different goods; check its status in TSDR.
- **Hearth:** now **three** family apps use the word. Hearth Display (display $599, membership $9.99/mo per a July 2026 review; iOS and Android companion apps) ([wetried.it](https://wetried.it/hearth-display-review-digital-calendar-organizer/), [App Store id6498717775](https://apps.apple.com/app/id6498717775)); Hearth: Family Care, 2 ratings, still lists shared family photos ([App Store id6779768761](https://apps.apple.com/app/id6779768761)); **new: "Family Recipe Keeper - Hearth"**, released Apr 6, 2026 ([AppsHunter](https://appshunter.io/ios/app/family-recipe-keeper-hearth/id6760669727)).

**Comparison**

| Name | Conflict (Oct 19) | Icon label (~12 chars) | Notice test | Phone and spelling test | Icon | Fit (STORY, A1/A2, moat) | Verdict |
|---|---|---|---|---|---|---|---|
| **Fridge Door** | **Low.** No app found. One diet-tracker mark, different goods | "Fridge Door" (11) fits | "Chase put 2 new photos of Mia on the Fridge Door." The name gives a verb: *put it on the fridge* | "Fridge Door, like your fridge." Nothing to spell. Risk: Gammy thinks she needs a smart fridge | Fridge with a photo under a magnet. Very easy | Preschool art goes on the fridge: the preschool-app feeling exactly. Only people who come in your kitchen see it (invite-only). Every house has one fridge: one photo, every household's fridge (moat A). No pressure to look (A2) | **Pick** |
| ~~Mantel~~ | **High.** Same name, same category, same pitch, earlier | "Mantel" (6) | "Chase put 2 new photos of Mia on the Mantel." Nice | **Fails:** even Chase wasn't sure of the spelling. "Mantle" leads to crypto (Mantle Network), equity software and the rival's listing; we'd need both domains | Mantel with frames | Formal, front-room, a bit older | **Stays dropped** |
| Hearth | **High for branding.** Three family apps, one funded and on Android | "Hearth" (6) | "Chase shared 2 new photos of Mia on Hearth." | **Weak:** heard as "Heart"; App Store search mixes heart apps | A fire. Easy | Warm, A1. Keeps all the work done so far | **Don't launch under it** |

**Variants**

| Variant | Conflict check (Oct 19) | Label | Note |
|---|---|---|---|
| On the Fridge | None found | "On the Fridge" (13), may truncate | Lovely in a sentence ("It's on the Fridge"), awkward as "Open On the Fridge" |
| FridgeDoor (one word) | FRIDGEDOOR FOOD TRACKER mark (above) | 10 | Harder to read for grandparents; keep two words in the app, one word only in the domain |
| The Fridge | No live app found | 10 | Too generic to own or search for |
| Mantelpiece | No app; a "Mantelpiece" vase/water-pipe brand ([thingtesting](https://thingtesting.com/brands/mantelpiece)) | 11 | Spelling worse; still "Mantel" root |
| Over the Mantel | None found | 15, truncates | Too long |
| ~~Hearthstone~~ | Blizzard's game, a famous mark | — | **Dead** |
| Hearthlight | No app; an itch.io game and a Baldur's Gate 3 item | 11 | Cleanest Hearth variant, still shares the "Hearth" root with Hearth Display. Heard as "Heartlight" |
| By the Hearth | No app; searches return Hearth Display | 12 | Same root problem |
| Hearthside | (Oct 17) no app | 10 | Same root problem |

**Recommendation (draft):** **Fridge Door**. Backup: **Hearthlight**, only if a lawyer says the "Hearth" root is fine; otherwise Homeplace (Oct 17 table) is the clean fallback.
- Honest risk: it may read as playful rather than secure to privacy-aware parents, and a grandparent may think it needs a smart fridge. Fix in the first line of the guide and store listing: "Fridge Door is a private photo app. No smart fridge needed."
- Checks before Chase commits: (1) USPTO Trademark Search for FRIDGE DOOR, FRIDGEDOOR, ON THE FRIDGE in classes 9, 42, 45, plus TSDR status of serial 77925527; (2) App Store and Google Play search on a phone; (3) RDAP or a registrar lookup for fridgedoor.family, .com, .app (don't buy); (4) a lawyer's look before milestone 7. Then Chase sets "Name final: yes" in ACCOUNTS.md and the rename (about an afternoon) happens **before** the domain, the first store build or telling relatives.

## Competition and moat (DRAFT, Oct 17, 2026)

Internal only. Never public copy. Every competitor fact below is as of Oct 17, 2026, mostly from search results. family-album.com and its help center didn't load from here, so FamilyAlbum facts come from search snippets of their own pages. Re-verify before any comparison is used.

**Verdict:** a crowded market for "private family photos", a thin one for "split families with a grandparent who won't use an app." Big players serve one happy family; nobody we found is built around households who must not see each other.

| Competitor | Price | Privacy stance | Data location | Per-post audience, groups hidden from each other? | Non-app grandparents | Source |
|---|---|---|---|---|---|---|
| FamilyAlbum (MIXI, Tokyo) | Free; Premium $5.99/mo or $59/yr, Pro $10.99/mo or $109/yr | Private album, encrypted in transit. App Store label lists data "used to track you" | Controller is MIXI, Inc., Japan; Japanese law governs Premium. **Storage location not found** | **Yes, partly:** Premium "Share Groups" limit a photo to a chosen group, admins only. Reply scoping and households: not found | App plus web/email notices (not verified) | [policy](https://family-album.com/privacy_policy), [Share Groups](https://help.family-album.com/hc/en-us/articles/360038780473-How-do-I-use-visibility-settings-other-than-Share-with-Family-and-Admins-Only), [pricing blog](https://blog.family-album.com/blog/is-familyalbum-really-free-what-you-get-without-paying/), [App Store](https://apps.apple.com/us/app/-/id935672069) |
| Tinybeans (ASX-listed) | About $74.99/yr Premium (per FamilyAlbum's blog; not neutral) | Says it doesn't sell data; you control followers | Not checked | **No:** journal-level access; a moment can be "hidden", not sent to a subset | Email updates (not verified) | [access levels](https://tinybeans.helpscoutdocs.com/article/105-what-are-the-different-access-levels-i-can-grant-followers), [App Store](https://apps.apple.com/us/app/-/id521633042) |
| Apple Shared Albums | Free | Shared Albums are **not** covered by Advanced Data Protection (standard encryption) | Apple, multi-region | Per-album, not per-post; members of one album see each other | Public web link for non-Apple viewers | [Apple security guide](https://support.apple.com/en-us/guide/security/sec973254c5f/web) |
| Google Photos shared albums | Free / Google One | Link albums viewable by anyone with the link; AI training stance unclear (competitor sources) | Google, multi-region | Per-album | Link, no app needed | [Google help](https://support.google.com/photos/answer/6131416), [Proton (biased)](https://proton.me/zh/blog/is-google-photos-safe) |
| Ente | Free 10 GB; ~$2.49 to $19.99/mo, family of 5 shares a plan | E2EE, open source (AGPL), audited | Ente's cloud or self-hosted | Shared albums; not a split-family model | Public links; still an app | [ente.com](https://ente.com/photo-backup-for-families/), [reclaimthenet](https://reclaimthenet.org/recommended-tool/ente) |
| Immich / PhotoPrism | Free, self-hosted | Your own server | Wherever you host it | Shared albums, partner sharing | Links; someone techy must run it | [elest.io](https://blog.elest.io/immich-vs-photoprism-which-self-hosted-photo-manager-for-your-family/) |
| Lifecake / Cluster | n/a | — | — | — | — | Lifecake discontinued by Canon in 2020 ([Dealroom](https://app.dealroom.co/companies/lifecake)); Cluster announced shutdown 2022, status unclear ([App Store reviews](https://apps.apple.com/app/id596595032)) |
| Hearth Display | $9/mo Family Membership + hardware | Family organizer screen | Not checked | No | It's a wall screen | See Name candidates |
| Hearth: Family Care | Not checked | Photos, voice, check-ins for an aging parent | Not checked | Not checked | Not checked | See Name candidates |
| Aura frames | Hardware ~$199 to $229, no subscription | App uploads face-recognition metadata if given library access (per review) | Not checked | No (one frame, shared senders) | **Best in class:** frame, no app for viewer; email upload | [mightygadget](https://mightygadget.com/aura-frames-mason-luxe-review/), [TechCrunch](https://techcrunch.com/2025/04/16/digital-frame-maker-aura-introduces-the-aspen-a-229-frame-with-more-intelligent-features) |
| Skylight frames | Hardware + Plus ~$39/yr | Private mode: approved senders only | Not checked | No | Frame; email photos to it works free | [Skylight](https://www.skylightframe.com/pages/how-to-use-skylight-plus), [wetried.it](https://wetried.it/skylight-frame-review/) |

### Chase's 4 candidate moats, scored

| Candidate | True today? | Competitor already has it? | Cheap to copy? | Do buyers pay for it? | Score |
|---|---|---|---|---|---|
| 1. AI 100% optional | Yes, and stronger: no AI on photos at all | Ente, Immich, Skylight-style frames | Yes (it's not doing something) | Rarely; it's a trust reason, not a purchase reason | **Table stakes for our buyer.** Keep as a pillar, not a moat |
| 2. US-based servers | Stored in the US: yes. "Never leaves": not yet (A3 gaps) | Most US apps; self-hosters | Yes, pick a region | Some parents care; vs FamilyAlbum (Japan-run) it's a real contrast if verified | **Real differentiator vs one rival, not a moat.** Keep calm, not fear |
| 3. Personal server | Not built; not defined | Ente and Immich self-host | Self-host: already free. Per-family store: copyable | Grandparents won't run a server | **Not a moat for this audience.** Park until Chase defines it |
| 4. Hyper privacy | Partly: invite-only, EXIF stripped, encrypted, but server-held keys | Ente is stronger (E2EE, audited, open source) | — | Yes, but Ente wins that buyer | **Can't win on privacy alone.** Win on *privacy between relatives*, which Ente doesn't do |

### Moat candidates (draft; test, don't assume)

| Candidate | Why it's hard to copy | What proves it | What kills it |
|---|---|---|---|
| **A. Privacy between relatives** (split-family model): post once, households, hidden groups, scoped replies, events (SPEC-GROUPS) | Workflow and data depth (RLS reply rules, share history) that big apps won't add because it complicates the median family. FamilyAlbum has Share Groups but nothing found on households or reply scoping | Mom posts to both sides for a month with zero slips; a grandparent says "I comment because the other side can't see it" | FamilyAlbum adds reply scoping; or families find groups too complex and use "Everyone" only |
| **B. The least-techy relative still gets the photos**: no password, email digest, real-name notices, printed guide, later a frame (CF-18, M6) | Requires A2 and grandparent-UX discipline across every surface, not one feature. Frames do this but can't do A | Earl-type relatives see photos weekly without installing anything; under 10 min setup unaided | Apple or Google make shared albums truly easy on Android and email; or a frame maker adds per-household audiences |
| **C. Trust and distribution**: founder story, WV homeplace, churches, co-parenting mediators and parenting classes | Relationships and word of mouth, not code. Slow, but rivals can't buy it | Families outside Chase's own join through a person they trust, no ads | Chase's time; it doesn't spread beyond one family's network |
| **D. Switching cost**: a family's households, groups and years of archive | Rebuilding the structure elsewhere is painful | A family stays a year | Must never trap anyone: export stays honest (A2). Weak until there's data |

Leading pick (draft): **A + B together**, aimed at one wedge: split families with a relative who won't use an app. Nobody found does both. C is how it spreads; D follows if A and B work.

## Privacy-first path (draft, Oct 17, 2026)

For Chase's "Signal-level privacy" idea. Internal only. Each step makes one more claim true; nothing here is built or decided.

**What "Signal-level" means:** only the people in the conversation hold the keys (end-to-end), the server keeps as little metadata as possible, and the code is open and audited. Hearth today: photos are encrypted before upload, but Hearth holds the keys; captions, names and replies are readable by Hearth; push notices carry real names through Expo, Apple and Google.

| Step | What changes | Claim it unlocks | Cost / tension |
|---|---|---|---|
| 1. Say it plainly | CF-13 "where your photos live" page: who holds keys, what Hearth can and can't read, every vendor | "Here's exactly what we can see" (true today) | Cheap. Honesty is the pitch to this audience |
| 2. Less metadata | Plain push text with no names or counts ("New photos on Hearth"), shorter log retention, no IPs kept | "Your phone's lock screen and Apple/Google don't learn who posted" | Fights BETA-NOTIFY-7 (real names help grandparents). Could be a setting |
| 3. Per-family keys | Each family space gets its own key under MEDIA_KEK; deleting a family destroys its key | "Delete your family and its photos are unreadable, even on backups" | Moderate backend work; fits CF-12 real deletion |
| 4. Encrypt words too | Captions and replies encrypted like photos | "Your captions and replies are encrypted, not just photos" | Breaks caption search later (ANCHORS); server-held keys still |
| 5. Open source + outside review | Publish the code; one independent review before launch | "Check our work" | Exposes the code; a review costs money (milestone 7) |
| 6. End-to-end vault | Keys live only on family devices, with a recovery key on paper | "Not even Hearth can see your photos" (Signal-level) | Lost phone with no recovery key = lost photos; Earl's web link (CF-18) gets much harder; adding someone to "Share all past photos" means re-sharing keys. CORE-FEATURES question 2 |

**Leading pick (draft):** steps 1 to 3 fit the proof of concept and stay true to A1. Step 6 as an opt-in vault for privacy-aware parents, after the beta, so grandparents never face a recovery key. Ente already wins buyers who want E2EE alone, so pair it with privacy between relatives (moat A).

## Ideas log (newest first)

| Date | Idea (Chase's words) | Serves | Status | Notes |
|---|---|---|---|---|
| Oct 19 | Naming shortlist: "Fridge Door, Mantel, Hearth" | All; CH-3 | Open: Chase decides | See "Name shortlist (Oct 19)". Draft pick Fridge Door ("Chase put 2 new photos of Mia on the Fridge Door"; preschool art on the fridge). Mantel stays dropped (Mantel: Family Album, same pitch; Chase's own "or however you spell mantle" shows the spelling trap, and "Mantle" is a crypto network). Hearth now has three family-app namesakes. Backup Hearthlight if a lawyer clears the root. Objection: may read as playful, not secure. Nothing bought; USPTO and domain checks unverified |
| Oct 18 | "The X% that would find it really cool to host their own version and build it out as they use it with their family", using Claude to fix bugs and add features | A4; audience: privacy-aware tech parents | **Parked** (Chase) | Same idea in the ANCHORS ideas log. Marketing angle later: "Your family's app. Your server. Your changes." A community of builder-parents could be the distribution channel. Business model, if revisited: free self-host, paid hosted plan for everyone else (Ente model) |
| Oct 17 | "Hyperfocus on privacy. Signal level privacy. I always thought discord had my own personal server or cloud server where only data lived." Audience: "educated, smart, tech savvy, developer, aware, X% thinks they are overprotective, but in reality they are just the ones reading the news" | A1, A3; problem: kids' privacy | **Chase, Oct 17: yes to an opt-in E2EE vault later** ("I like this idea"); name: **"the family vault"**, "could have some cool ui/ux" (UX ideas in ANCHORS, grandparent-ux reviews). "Personal server" question still open | Discord correction: a Discord "server" is a space on Discord's shared cloud, and text isn't E2EE (calls are, since March 2026). See "Privacy-first path" and the new audience row. Sharper: "Not overprotective. Paying attention." / "For parents who read the privacy policy." Objection: Ente already is E2EE and open source; and Signal-level keys make a lost phone lose photos, which breaks A1 for grandparents. Don't invent the X%; find a real survey (e.g. Pew) before using a number. No fear selling |
| Oct 17 | "Is there a ton of competition? Consider our moat. If you don't see a moat, work with me to determine one." Candidates: "(1) AI 100% optional, (2) US-based servers, (3) personal server, (4) hyper privacy" | A1, A3; problems: split families, kids' privacy | Open: Chase answers 3 questions | See "Competition and moat". All 4 are pillars or table stakes, not moats; personal server is not built (ANCHORS ideas log, staff-pm). Leading moat: privacy between relatives + least-techy access |
| Oct 17 | "Name: Hearth may not work; what are the other options?" (an earlier session said the name wouldn't work; no record of that in the repo) | All; CH-3 | Open: Chase decides | Live check found two family apps already named Hearth (see Name candidates). Top 3: Homeplace, Lamplight, Fridge Door. Nothing renamed in code or docs. Do a USPTO search and a lawyer's look before buying any domain |
| Oct 16 | "Distributed families": families spread across households, places and generations. "We want to build for all family types, optimized for highly complex families." | A1, A2 | Logged; term to use | Candidate audience line: "for distributed families". Check positioning draft wording ("complicated families") against it |
| Oct 16 | A3 positioning: "your kids' photos never leave the US / never sent to China", not partisan | A3 | Logged (from ANCHORS.md) | Use "stored in the US" until the A3 gaps close |
| Oct 16 | AI positioning session: what can Hearth say about AI and still allow helpful tools | A1–A3 | To schedule | Agenda in ANCHORS.md |
