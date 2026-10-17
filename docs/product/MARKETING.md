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
| No ads, no AI training, no face scanning, no trackers | True today | "Never build" in CORE-FEATURES.md; keep it in writing |
| Location stripped on the phone | True today (photos) | Not video; video isn't in beta |
| Encrypted before upload | True today | Keys are server-held. Never say "end-to-end" |
| Stored in the US | True today | Supabase East US, Backblaze US East |
| Never leaves the US | **Not yet** | Supabase auth logs/support and Apple/Google push transit. See ANCHORS A3 gaps |
| Same quality on iPhone and Android | Photos: true today | Video: future (CF-17). Android app is milestone 5 |
| Nobody can see if you've looked | **Not yet** | "Seen by N of M" conflicts with A2; decision pending |
| Comments stay private to the right people | Partly | Comments are seen by the post's whole audience today |

## Audiences

| Audience | Why they care | Where they are (to verify) |
|---|---|---|
| Parents in split or blended families | 5+ group texts, slighted relatives | — |
| Parents who don't post kids online | Privacy, AI training, strangers | — |
| Grandparents who avoid social media | Want photos, not Facebook | Reached through their kids, not directly |
| Co-parents | Separate households, no overlap | — |

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

## Ideas log (newest first)

| Date | Idea (Chase's words) | Serves | Status | Notes |
|---|---|---|---|---|
| Oct 17 | "Name: Hearth may not work; what are the other options?" (an earlier session said the name wouldn't work; no record of that in the repo) | All; CH-3 | Open: Chase decides | Live check found two family apps already named Hearth (see Name candidates). Top 3: Homeplace, Lamplight, Fridge Door. Nothing renamed in code or docs. Do a USPTO search and a lawyer's look before buying any domain |
| Oct 16 | "Distributed families": families spread across households, places and generations. "We want to build for all family types, optimized for highly complex families." | A1, A2 | Logged; term to use | Candidate audience line: "for distributed families". Check positioning draft wording ("complicated families") against it |
| Oct 16 | A3 positioning: "your kids' photos never leave the US / never sent to China", not partisan | A3 | Logged (from ANCHORS.md) | Use "stored in the US" until the A3 gaps close |
| Oct 16 | AI positioning session: what can Hearth say about AI and still allow helpful tools | A1–A3 | To schedule | Agenda in ANCHORS.md |
