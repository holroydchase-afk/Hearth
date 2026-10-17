# Spec: groups, households, events, roles and share history

Owner: staff-pm. Oct 17, 2026 (rework; replaces the "one family hierarchy" spec, commit e18d430, which was `SPEC-HIERARCHY.md`). Status: **Chase's direction given Oct 17, 2:47 am; 3 one-word questions open (section 9).** Needs privacy-security review of the data model, the reply rule and the share-history cutoff before any build: all three change who sees posts and replies. Acceptance criteria are copied into `docs/product/BETA-SPEC.md` ("Groups criteria, Oct 17"); that file wins if they ever differ.

Chase, Oct 17, 2:47 am (verbatim): "I don't want to over complicate. This is a real use case: siblings. Because they will commonly be on both mom and dad's side. I'd rather have set groups with the work around to have folks in multiple groups or households. Also a custom group (probably largely covered by events). I think simply: Households slightly under groups. Maybe only parents can send to everyone or certain roles (we also need to invest time into roles staff pm). Also give folks the option to share all or not default to shell history / previous photos. Many of the edge cases were noodling are resolved with events because it has the ability to combine house holds and groups. ... Simple UX but hyper flexible for future."

Read "shell history" as **share history**: when someone is added, the parent picks whether they see past photos, with no default.

## Decision in two lines
A fixed, three-part shape: **Everyone** at the top, a few **set groups** (Chase's side, Danielle's side), and **households** just under them; a person can be in more than one household and a household in more than one group, which covers siblings. **Events** are the one flexible piece: a parent combines any groups and households into an event (the Charleston trip, the birthday at Gigi's, any custom group), and only parents send to Everyone.

What changed from the hierarchy spec: no arbitrary tree, no group-inside-group, no "sides" as their own kind (a side is just a set group), the Charleston trip and Gigi's birthday become events, event members read each other's replies, share history is an explicit choice instead of "yes", and roles are written down.

## 1. What each part solves (from STORY.md)

| Part | Problem it solves (quoted) | Call |
|---|---|---|
| **Everyone**, one tap, first | "for us 90% of the content we post will be to everyone." Parental guilt: "Sharing in 3 taps" | Build |
| **Set groups** (Chase's side, Danielle's side) | Danielle's side: "Two families' worth of households, not one" | Build |
| **Households slightly under groups**; the reply unit | "Grandma A should be able to comment on a photo without divorced Grandpa B seeing it, and without worrying that he might." | Build |
| **A person in more than one household or group** (siblings) | "My mom's parents are divorced and remarried. My parents are divorced and remarried." A grown child of divorced parents belongs with both | Build |
| **Events** (combine households and groups; also the custom group) | "My dad's side was there, Danielle's dad's side was there. I'd want to only post to those groups." The Charleston trip: "That would be a natural group." | Build, minimal |
| **Roles: only parents send to Everyone** | "Parents know it's secure and that only people they trust are in it." A1: "nothing to second-guess about who sees what" | Build (server check) |
| **Share history, no default** | PERSONAS: "Gammy is dating. A new partner may join later, or may be kept out; groups have to handle both without drama." A1 | Build |
| Event dates, place, RSVPs, invites to an occasion | ANCHORS coordination idea. No STORY problem yet | **Cut.** Columns only (section 4) |
| Group chat | ANCHORS idea. BETA-SPEC Not now: families already have texting | **Cut.** Room left |
| Group inside a group, drag-to-organize, guided setup | Chase: "I don't want to over complicate." Events cover the cases | **Cut.** Room left |
| Per-person permissions (grants) | Chase: "certain roles" later | **Cut** from the first build; one check function makes it a later add-on |
| Per-group "members see each other's replies" switch (0009) | Replaced by the household and event rules. Chase, Oct 17: remove it | **Remove** |

## 2. The shape, in plain words

| Thing | What it is | Who's in it | Example |
|---|---|---|---|
| **Everyone** | The whole family space. Exactly one | Every member | Everyone |
| **Group** | A set, long-lived part of the family. A few per family | The households placed under it | Chase's side; Danielle's side |
| **Household** | The people who read each other's comments. Not an address | People. A person can be in several | Gammy's house; Pawpaw and Granny's house |
| **Event** | A room for an occasion or any custom mix | Any groups and households a parent picks | Charleston trip; Birthday at Gigi's; Thanksgiving 2026 |

Parents (Chase, Danielle) sit above all of it: they see every post and read every reply. They're in no household.

**Allowed links, first build:** household → group, household → event, group → event. Nothing else. People go only in households.

**Starter setup for Chase's family** (Chase corrects it; Claude builds it in `family-setup.sql` v2):

| Name | Kind | Holds |
|---|---|---|
| Everyone | everyone | every member |
| Chase's side | group | Gammy's house; Grandaddy and Grandmomma's house; Gigi and Bebar's house |
| Danielle's side | group | Memaw's house; Pawpaw and Granny's house; Grandma Phyllis's house |
| Charleston trip | event | Pawpaw and Granny's house; Danielle's sister (her own house) |
| Birthday at Gigi's | event | Grandaddy and Grandmomma's house; Gigi and Bebar's house; Pawpaw and Granny's house. Chase confirms who was there |

Households: Gammy (Barbara); Grandaddy (Scott) and Grandmomma (Margie); Gigi (Sarah) and Bebar (Fred); Memaw (Susan); Pawpaw (John) and Granny (Anna); Grandma Phyllis. **Danielle's sister** (name to fill in): placed in Memaw's house **and** Pawpaw and Granny's house (the sibling workaround, section 6), so she's under Danielle's side through both. Whether she also gets a house of her own (a spouse) is Chase's call.

## 3. Events

**What an event is, first build:** a name plus the groups and households a parent picked. It shows in the share sheet under "Events". That's all. A custom group ("the cousins", "Texas family") is an event with no date; no separate kind.

**Event rule for replies:** everyone in an event reads each other's comments and hearts on that event's posts (open question 1). The parent put them in one room on purpose; they were together. Outside the event, the household rule holds.

**Edge cases events now absorb** (from the hierarchy spec):

| Old edge case | Now |
|---|---|
| Charleston trip crosses households and states, needed many-to-many groups | An event linking two households |
| Birthday at Gigi's: two sides' dads' households only | An event linking three households |
| Old open question 1: on a group post, do replies reach the whole group? | No. Groups keep the household rule; the event is the explicit "talk together" room |
| Groups holding groups (arbitrary nesting) | An event can hold groups; nothing else nests |
| Gammy's new partner: in for Thanksgiving, not yet in her house | His own house of one, linked to the Thanksgiving event only. He sees that event's photos, nothing else |
| A custom group | An event with no date |

**Later, not built** (each traces to the ANCHORS coordination idea, not a STORY problem yet): dates shown and the event dropping out of the picker after it ends; place; "Invite the family" notices to an event's members; RSVPs (one row per person per event); an event chat. Each reads the same membership, so none can reach someone outside the event.

**When parents make events:** first build, Claude adds them in `family-setup.sql` when Chase asks (through milestone 3, Chase and Danielle are the only parents). A "New event" screen for parents is BETA-AUD-22, milestone 4.

## 4. Roles

**Today's code (0001, 0009):** `space_members.role` is `owner | adult | viewer`. `is_space_manager` = owner or adult (groups, invites). Owner-only: invite owners or adults, the family reply setting (AUD-10). `spaces.viewers_can_post` and `viewers_can_comment` are family-wide switches. Separate and unrelated: `household_role` (`admin | adult`) belongs to 0001's `households` table, the **parents'** household that owns a space (co-parent split, AUD-4; Rob retired). Relatives' households in this spec are `circles` rows, not that table.

| Role (app words) | Code | Who | Can |
|---|---|---|---|
| **Owner** | `owner` | Chase | Everything a parent can, plus: invite parents, the family reply setting, hand the family to someone else. At least one always (built) |
| **Parent** | `adult` | Danielle | Post to anything, including Everyone; make events; invite relatives; pick share history; see every post; read every reply; their replies reach the whole audience |
| **Relative** | `viewer` | everyone else | See, heart, comment. No settings. Posting: off until milestone 4, then to their own groups only (open question 2) |

**Who sends to Everyone, first build:** owner and parents only (Chase: "Maybe only parents can send to everyone"). Enforced on the server on every path, not only in the share sheet.

**Room for later roles without new screens now:** every permission check goes through one function, `can(space, capability)`, with capabilities `post`, `send_to_everyone`, `make_events`, `invite`, `set_up_family`, `family_settings`. Today it reads only the role (and `viewers_can_post`). Later a `member_grants (space_id, user_id, capability)` table lets a parent hand one capability to one person (Gammy can send to Chase's side; an aunt can make events) and `can()` reads it too; no call site changes. Not built now.

## 5. Share history

**Rule:** whenever a parent adds a person (invite), a household to a group or event, or a group to an event, they pick **"Share all past photos"** or **"Only new photos"**. Neither is preselected. The server refuses the add without a choice.

**"New" means shared from that moment on, by the date shared, not the date taken.** Old photos Chase bulk-imports later (overnight plan) count as new, on purpose: the parent is choosing what to share from now on. The words say so.

**Screen (first build: the invite form on the Groups screen; adding households to groups or events is script-only until AUD-22).** grandparent-ux owns final words.

> **Invite someone to Gammy's house**
> Their name, the way your family says it: [ Like "Grandma June" ]
> **Should they see photos already shared?**
> ( ) **Share all past photos** — They'll see every photo already shared with Gammy's house and its groups.
> ( ) **Only new photos** — They'll see photos shared from today on, including older photos you add later.
> [ Make the invite ] (stays off until one is picked; tapping it says "Pick one above first.")

Two big rows, 48pt, words under each, no switch. A count ("214 photos") is a stretch goal if it's cheap and safe.

**Where the cutoff applies:** feed, timeline, years list, open-by-ID, media signer, replies (a reply on a post you can't see is not found). Notices only go out for new posts, so they're unaffected. Changing the choice later: script-only in the first build, no screen.

## 6. Reply rule under this model

A reply is a comment or a heart. Reader R may read reply X by writer W on post P only if R can see P, **and** at least one holds:

1. R is W.
2. R is a parent (owner or adult).
3. W is a parent.
4. R is P's author.
5. W is P's author (their replies on their own post reach its audience).
6. R and W are placed in the same household (any one, if either is in several).
7. R and W are both in an **event** that is in P's audience (open question 1).
8. The owner has set family replies to "everyone the post went to" (AUD-10, built, kept).

Counts shown to R count only replies R may read. Evaluated at read time, as 0009 does. Nothing relays: a person in two households lets each household read **that person**, never each other.

**Sibling case: Danielle's sister, placed in Memaw's house and Pawpaw and Granny's house; post to Everyone.**

| Who comments | Who reads it | Who doesn't |
|---|---|---|
| Danielle's sister | Memaw, Pawpaw, Granny, Chase, Danielle (and the author) | Gammy, Grandaddy, everyone else |
| Memaw | Danielle's sister, Chase, Danielle | Pawpaw, Granny |
| Pawpaw | Granny, Danielle's sister, Chase, Danielle | Memaw |

Her comment box says "Memaw, Pawpaw, Granny, Chase and Danielle will read this", so she knows before sending. The same works for any sibling of Chase's placed in Gammy's house and Grandaddy and Grandmomma's house.

**Event case: post to the Charleston trip (Pawpaw and Granny's house + Danielle's sister).**

| Who comments | Who reads it | Who doesn't |
|---|---|---|
| Granny | Pawpaw, Danielle's sister, Chase, Danielle | Memaw (she can't see the post at all) |
| Danielle's sister | Pawpaw, Granny, Chase, Danielle | — |

**Event case: Birthday at Gigi's** (Grandaddy and Grandmomma's, Gigi and Bebar's, Pawpaw and Granny's houses): Grandaddy's comment reaches Grandmomma, Gigi, Bebar, Pawpaw, Granny and the parents. Gammy and Memaw never see the post.

**Mixed audience: one post to Everyone and to the Charleston trip.** Granny's comment reaches the event (Pawpaw, the sister) plus the parents; Memaw sees the photo but not Granny's comment.

**Other edges:** a relative not yet in any household (legacy) is read by parents and the author only. Someone moves households: read-time rule, so the new household reads their past replies and the old one stops (privacy-security to confirm). A household removed from a group or event loses its posts at once (SEE-6), and the replies with them.

## 7. Data model (for app-engineer after review; no code in this spec)

Every container is a `circles` row (the app says "group"; never "circle").

| Table / column | Holds | Rules |
|---|---|---|
| `circles.kind` | `everyone \| group \| household \| event` | Existing rows become `group`. One `everyone` per space. |
| `circles.starts_on`, `ends_on` (date, null) | Event dates | Unused by the app in the first build |
| `circle_links (parent_id, child_id, sees_from)` | "this group/event holds that household/group" | Same space; allowed pairs in one place (`link_allowed(parent_kind, child_kind)`): household→group, household→event, group→event. A loop-check trigger exists from day one. |
| `circle_people (circle_id, user_id, sees_from)` | A person placed in a household | Household only (hard after the re-seed). Several households per person allowed. |
| `space_members.sees_from` | Share-history cutoff for Everyone | Set when the invite is redeemed: null for "all", the invite's creation time for "new" |
| `invites.history` | `all \| new`, required on new invites | Copied onto the placement and `space_members` at redemption |
| `circle_members` (existing) + `sees_from` | **Derived**: who sees each container, and from when | Rebuilt by trigger in the same transaction. Per path, the latest cutoff wins; across paths, the earliest. Parents are in every container with no cutoff. |

**Why derived:** `can_view_post`, `get_feed`, `get_timeline` (0010), the notify outbox, `sign-media` and `can_see_profile` keep reading `circle_members`. The share-history cutoff is the one new condition (`sees_from is null or published_at >= sees_from`) and must live in **one** shared predicate that every reader calls; a parity test (AUD-20) proves they agree.

**Nesting later:** add a pair to `link_allowed` (say group→group). The table, loop check and derive trigger already handle any depth. No migration of data.

**API (contract tests change first):** `my_circles` returns `kind` and `parent_ids`, drops `replies_shared`. Manager-only RPCs: `create_level(p_space, p_kind, p_name)`, `link_level(p_parent, p_child, p_history)`, `unlink_level`, `place_person(p_household, p_user, p_history)`, `unplace_person`. `create_invite` gains a required `p_history` for viewers and names one household. Missing or bad `p_history`, a bad pair, a loop or a cross-space link: `23514`. Not a manager or not found: `P0002`. `reply_readers(p_post)`: first names who'll read the caller's reply. `set_group_replies_shared` is dropped. Send-to-Everyone goes through `can(space, 'send_to_everyone')` in `create_post` **and** the `post_audiences` insert policy (today that policy only checks authorship; privacy-security to confirm).

## 8. Order of work and migrations

Numbering is fixed across this spec and `/mnt/project-files/plans/overnight-bulk-timeline.md`:

1. **0010: timeline** (`get_timeline`, `get_timeline_years`, index, batched notice). Overnight plan, milestone 1, waiting on Chase's go.
2. **0011: family shape** (kinds, links, placements, events, share history, `can()`, send-to-Everyone check, 0009 switch removed). Access-neutral for everything that exists (AUD-16). Adds the cutoff to the shared predicate that 0010's `get_timeline` uses. After privacy-security review; before milestone 3.
3. **`family-setup.sql` v2 re-seed** on hosted: section 2's setup, legacy placements removed.
4. **0012: households-only placement becomes hard.**

If the timeline is cut, the family shape takes 0010 and the timeline the next free number; whoever renumbers updates both documents.

**First build (before milestone 3):** 0011, the re-seed, the share sheet (Everyone first, then Groups, then Events, each "name · N people"), the invite form's share-history choice, comment-box names, the switch removed. **Milestone 4:** "New event" screen (AUD-22), relatives posting (REPLY-13). **Relatives see no change** except the comment box naming who will read.

**Acceptance criteria:** BETA-AUD-11 to 22 and BETA-REPLY-7 to 13 in `docs/product/BETA-SPEC.md`.

## 9. Open questions for Chase (one word each)

**Answered Oct 17, 3:26 am:** 2 Groups, 3 Parents (Chase). 1 left unanswered; going with the recommendation, Event, and Chase can change it.


1. **Event replies: Event or Household?** Should everyone in an event read each other's comments on its photos? Recommendation: **Event.** They were in one room; it's what makes an event worth having, and it settles the Charleston case. The event screen will say so.
2. **A relative's post goes to: Groups or Everyone?** (milestone 4) Recommendation: **Groups**, the groups they're in, with no picker; matches "only parents send to everyone". Their post screen names who will see it.
3. **Who sends to Everyone and makes events: Parents or Owner?** Parents = you and Danielle; Owner = you only. Recommendation: **Parents.** Danielle posts too (milestone 2), and making her ask you defeats "Sharing in 3 taps".
