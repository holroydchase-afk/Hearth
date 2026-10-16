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

## Ideas log (newest first)

| Date | Idea (Chase's words) | Serves | Status | Notes |
|---|---|---|---|---|
| Oct 16 | A3 positioning: "your kids' photos never leave the US / never sent to China", not partisan | A3 | Logged (from ANCHORS.md) | Use "stored in the US" until the A3 gaps close |
| Oct 16 | AI positioning session: what can Hearth say about AI and still allow helpful tools | A1–A3 | To schedule | Agenda in ANCHORS.md |
