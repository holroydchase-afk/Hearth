# Spec: one family hierarchy for sharing and replies

Owner: staff-pm. Oct 17, 2026. Status: **Chase: roll with it, Oct 17.** Needs privacy-security review of the reply rule and the data model before any build (it changes who sees posts and replies). Acceptance criteria are copied into `docs/product/BETA-SPEC.md` ("Hierarchy criteria, Oct 17"); that file wins if they ever differ.

Chase's direction, Oct 17: "if its a good idea, then roll with it, but remember we must roll up to the problems we are trying to solve ... I don't want to overcomplicate what we build. I want to ensure we are considering the future when building the infrastructure."

## Decision in two lines
One hierarchy per family: **Everyone** at the top, **sides** under it, **households** at the bottom, plus **groups** that can hold any households, sides or other groups (many-to-many, so the Charleston trip group holds Pawpaw and Granny's household and Mom's sister's household in Texas). A post goes to any level and everyone under it; a relative's replies stay in their own household plus Chase, Mom and the post's author; parents' replies reach the whole audience.

**Many-to-many: yes.** A household can sit under a side and under any number of groups at the same time. A group can hold households, sides and other groups. The only rules are: no loops, everything stays inside one family space, and people are placed only in households. A strict tree can't express the Charleston group, which crosses places (Charleston, WV and Texas) and households.

## 1. What each part solves (from STORY.md)

| Part | Problem it solves (STORY.md, quoted) | Keep? |
|---|---|---|
| **Everyone**, one tap, first in the list | "for us 90% of the content we post will be to everyone." and parental guilt: "Sharing in 3 taps" | Yes |
| **Sides** (Chase's side, Mom's side) | "Two families' worth of households, not one"; "My dad's side was there, Mom's dad's side was there. I'd want to only post to those groups." | Yes |
| **Households** as the bottom level | "Grandma A should be able to comment on a photo without divorced Grandpa B seeing it, and without worrying that he might." Households are the unit that "won't sit in the same room" | Yes |
| **Groups across households and places** | The Charleston trip: Mom's dad and stepmom plus her sister from Texas, "that would be a natural group"; the birthday at Gigi's | Yes |
| **Reply rule: household plus parents** | Same core quote; closes "Story problems with no passing criterion" #1 and #2 in BETA-SPEC; A2 (neither side sees the other engaging) | Yes |
| **Parents set it up; relatives have no settings** | "Grandparents who aren't techy or are rural"; A1 "nothing to second-guess about who sees what" | Yes |
| Relatives posting freely | "Parents set it up; everyone else just posts" (ANCHORS, Oct 16) | Yes, second build (M3), rule specced now |
| Events (temporary branch) | Birthday at Gigi's, Charleston trip | **Data room only.** A group already covers both stories; dates and expiry wait |
| Group chat | ANCHORS idea, Oct 17. Solves no STORY problem yet ("families already have texting", BETA-SPEC Not now) | **Cut from build.** Model leaves room |
| Family coordination (invites to an occasion, RSVPs) | ANCHORS long-term direction. No STORY problem yet | **Cut from build.** Model leaves room |
| Drag-to-organize or guided setup screen | "Parents set it up", but only Chase sets up in the POC (`family-setup.sql`) | **Cut** until milestone 4 or a second family |
| Per-group "members see each other's replies" switch (0009) | Replaced by the household rule. Chase, Oct 17: remove it | **Remove** |

## 2. First build (minimal)

Ships before milestone 3 (the first relative), so the family is set up once in the new shape. It does not block the milestone 1 deploy or Mom at milestone 2.

**What ships**
1. Backend migration 0010: levels (Everyone, side, household, group), links between levels, people placed in households, the new reply rule, the 0009 group switch removed. Access-neutral for existing groups until the re-seed (section 5).
2. `family-setup.sql` v2: Claude builds Chase's real family from his list (below). No setup screen.
3. **Share sheet** (parents only): "Everyone · N people" first and preselected on a first post; then "Choose who sees it" opens one list, sides with their households indented under them, then groups. Each row says the name and the number of people in words. More than one may be picked. Last-used stays preselected after the first post (AUD-2, B8): the wrong default then fails toward fewer people, and since 90% of posts go to Everyone, the last-used is Everyone 9 times in 10.
4. **Groups screen** (parents only): the same list, read-only, with each level's people; rename stays (0008). No create, move or drag.
5. **Comment box words** for everyone: who will read your reply, by name ("Pawpaw, Chase and Mom will read this"). grandparent-ux owns the final words.
6. App: the group switch and its words are removed from the Groups screen.

**What relatives see:** no change. Photos, full screen, Heart, Comment, Help. They never see a level's name, a side, a household, or that other households exist. The only new thing is the comment box naming who will read their reply. No settings.

**Starter setup for Chase's family** (from PERSONAS.md; Chase corrects names in `family-setup.sql`):

| Level | Kind | Holds |
|---|---|---|
| Everyone | everyone | every member of the family space |
| Chase's side | side | Gammy's house, Grandaddy and Grandmomma's house, Gigi and Bebar's house |
| Mom's side | side | Memaw's house, Pawpaw and Granny's house, Great-Grandma's house, Mom's sister's house (Texas) |
| Charleston trip | group | Pawpaw and Granny's house, Mom's sister's house |
| Birthday at Gigi's | group | Grandaddy and Grandmomma's house (Chase's dad's side), Gigi and Bebar's house, Pawpaw and Granny's house (Mom's dad's side). Chase confirms who was there |

Households hold people: Gammy; Grandaddy and Grandmomma; Gigi and Bebar; Memaw (Sue); Pawpaw and Granny; Great-Grandma; Mom's sister (name to fill in). Chase and Mom are parents: above every level, in no household.

## 3. Data model

Words: "level" is a docs word only. The app says Everyone, side names, household names ("Gammy's house") and "group". In code, every level is a row in `circles`. Note the name clash: 0001's `households` table is the **parents'** household that owns a space (co-parent split, AUD-4). Relatives' households are `circles` with `kind = 'household'`. No rename now.

| Table / column | What it holds | Rules |
|---|---|---|
| `circles.kind` | `everyone` \| `side` \| `household` \| `group` | Existing groups become `group`. Exactly one `everyone` per space (partial unique index), made by the migration. |
| `circle_links (parent_id, child_id)` | "this level holds that level" | Same space. Parent is `side` or `group`. Child is `side`, `household` or `group`. No loops (trigger walks up). `everyone` is never linked: it means every space member. Many parents per child allowed. |
| `circle_people (circle_id, user_id)` | where a person is placed | The level must be a `household` (legacy rows on old groups allowed until the re-seed, then a constraint forbids them). A person may be in more than one household. The person must be a space member (same trigger as today). |
| `circle_members` (existing) | **Derived**: everyone who can see posts at that level | Rebuilt by trigger, inside the same transaction, from `circle_people` + `circle_links` (the level and everything under it) + the space's owners and adults. Everyone = all space members. No app writes. |

**Why derive `circle_members` instead of rewriting the access rule:** `can_view_post`, `get_feed`, the notify outbox, the `sign-media` function and `can_see_profile` all read `circle_members` today and stay unchanged. The blast radius is the trigger, which gets its own SQL tests. Removal stays immediate (SEE-6): the rebuild commits with the change. For a family of under 50 people a whole-space rebuild on each change is fine; the perf suite checks it.

**Behavior that follows:** parents are in every level, so Chase and Mom see every post in their family, including a relative's. Adding a household to a level shows them that level's past posts (same as adding someone to a group today; open question 3). Removing a level (soft delete) leaves its posts visible only to the author and the parents, unless they went to another level too.

**Room left for later, nothing built:**
- **Events:** a fifth `kind = 'event'` plus `starts_on`/`ends_on`, built from picked levels with the same `circle_links`. "Temporary" means it drops out of the picker after `ends_on`; posts keep their audience. The Charleston trip and Gigi's birthday can become events by changing `kind`.
- **Group chat:** a `conversations` row hangs off one level; readers are that level's `circle_members`. Whether a relative's message crosses households is decided when chat is specced (same question as open question 1). No relative ever reaches someone outside the level.
- **Coordination:** invites to an occasion are a notice to an event's members; RSVPs are one row per person per event. Invites to join Hearth already point at levels (`invite_circles`); in the new model an invite names one household.

**API changes (docs/eng/API.md; contract tests change first):** `my_circles` returns `kind`, `parent_ids` and drops `replies_shared`. New manager-only RPCs used by `family-setup.sql`: `create_level(p_space, p_kind, p_name)`, `link_level(p_parent, p_child)`, `unlink_level`, `place_person(p_household, p_user)`, `unplace_person`. Each: not a manager or not found is `P0002`; a loop, cross-space link or wrong kind is `23514`. `reply_scope` returns `'everyone' | 'household' | 'parents'`. New `reply_readers(p_post)`: the first names who will read the caller's reply, or null when it's everyone; `P0002` when the post isn't visible. `set_group_replies_shared` is dropped.

## 4. The reply rule

A reply is a comment or a heart. Reader R may read reply X left by person W on post P only if R can see P, **and** at least one of these holds:

1. R is W.
2. R is a parent (owner or adult of P's space).
3. W is a parent. (Parents' replies reach the whole audience.)
4. R is P's author. (You read every reply on your own post.)
5. W is P's author. (An author's replies on their own post reach that post's audience, like the caption.)
6. R and W are both placed in the same household (any one, if either is in several).
7. The space's owner has set replies to "everyone the post went to" (AUD-10, kept; built, and a parent setting, not a relative one).

Hearts and comment counts shown to R count only replies R may read. Evaluated at read time, as 0009 does.

**Edge cases**

| Case | Result |
|---|---|
| Post to **Everyone**; Gammy comments | Chase, Mom, the author, and anyone else in Gammy's house read it. Grandaddy and Grandmomma don't, and their heart count doesn't include her heart |
| Post to the **Charleston trip** group (spans two households); Granny comments | Pawpaw (her household), Chase, Mom and the author read it. Mom's sister does **not** (other household), unless open question 1 is "Group" |
| Mom's sister (household of one) comments | Chase, Mom and the author only |
| **Person in two households** (say a teen splits time between Memaw's and Pawpaw's houses) | Their reply reaches both households' members who can see the post; they read replies from both. The parents chose that by placing them in both. Nothing crosses through them to a third household |
| **Relative posts** (second build) | Their post goes to Everyone (open question 2), with no picker. They read every reply on it (rule 4); their own replies on it reach its audience (rule 5); others' replies follow rules 1–3 and 6 |
| Relative with no household (legacy, before the re-seed) | Parents and the author only: today's safe default |
| Someone moves households (Gammy's new partner joins her house, or later leaves) | Rule is read time: the new household reads their past replies; the old one stops. privacy-security to confirm this is acceptable |
| Household removed from a level | They lose that level's posts at once (SEE-6), and with them every reply on those posts |
| Two parents | Both read everything; nothing a parent writes is hidden from the audience |

## 5. Migration path

1. **0010 (additive, access-neutral):** add `kind` (existing rows `group`), `circle_links`, `circle_people`. Copy every current `circle_members` row into `circle_people` as a legacy placement. Create the Everyone level per space. Install the rebuild trigger. Result: every existing group has the same people as before; nobody gains or loses a post. Test: AUD-16.
2. **Same migration, reply switch removed:** rewrite `can_see_reply`, `reply_scope` and `my_circles` without the group branch; drop `circles.replies_shared` and `set_group_replies_shared`. Any group with the switch on loses it, which only narrows who reads (privacy-safe); the migration prints how many were on. The app's switch and its tests go in the same change (contract tests first).
3. **`family-setup.sql` v2 re-seed:** builds sides, households and groups from section 2, places people in households, links old groups' audiences to the new levels, then removes legacy placements. A check fails if any relative is still placed outside a household, after which a constraint forbids it.
4. **0011 (after re-seed on hosted):** the "households only" constraint becomes hard.

## 6. Acceptance criteria

All need a failing test first with the ID in its title. SQL in `backend/tests/hierarchy_test.sql` unless noted. M = first milestone that needs it.

| ID | Type | Pri | M | Given / When / Then |
|---|---|---|---|---|
| BETA-AUD-11 | auto | P0 | 3 | **Given** a family with Everyone, 2 sides and 7 households, **When** a parent posts to a side, **Then** every person placed in a household under that side, plus both parents, can see it, and nobody placed only under the other side can (feed, post ID, media signer, push and email all deny). |
| BETA-AUD-12 | auto | P0 | 3 | **Given** a Charleston trip group holding Pawpaw and Granny's household and Mom's sister's household, which sit under Mom's side, **When** a parent posts to the group, **Then** Pawpaw, Granny and the sister see it, Memaw and Great-Grandma don't, and the same households still see side and Everyone posts (many-to-many). |
| BETA-AUD-13 | auto | P0 | 3 | **Given** levels in one space, **When** someone links a level under itself or its own child, links across two spaces, places a person in a side or group, or a viewer calls any setup RPC, **Then** each is refused (`23514` for bad shape, `P0002` for non-managers) and nothing changes. |
| BETA-AUD-14 | auto | P0 | 3 | **Given** a relative (viewer), **When** they call every RPC and read every table they can, **Then** no level name, kind, link, member count, or other household's member comes back; their own feed shows only posts and their authors. |
| BETA-AUD-15 | auto | P0 | 3 | **Given** a person removed from a household, or a household unlinked from a side, **When** they request that level's posts or media, **Then** the database denies them in the same transaction and issued media URLs expire within 10 minutes (as SEE-6). |
| BETA-AUD-16 | auto | P0 | 2 | **Given** today's flat groups with their members and posts, **When** migration 0010 runs, **Then** for every user, `get_feed` and `can_view_post` return exactly what they returned before (snapshot diff, 0 changes), and one Everyone level exists per space. |
| BETA-AUD-17 | manual | P0 | 3 | **Given** the share sheet on Chase's iPhone, **When** Chase and Mom each share one photo to Everyone and one to the Charleston trip, **Then** Everyone takes 1 tap, each choice reads as name plus "N people", and both answer "who sees this?" correctly from the screen alone (2 of 2). |
| BETA-REPLY-7 | auto | P0 | 3 | **Given** a post to Everyone, **When** Gammy comments and hearts it, **Then** Chase, Mom, the post's author and Gammy's household read both; Grandaddy and Grandmomma read neither, and their heart and comment counts leave them out. |
| BETA-REPLY-8 | auto | P0 | 3 | **Given** a post to the Charleston trip group, **When** Granny comments, **Then** Pawpaw, the parents and the author read it, and Mom's sister does not (unless Chase answers "Group" to open question 1, then this test flips). |
| BETA-REPLY-9 | auto | P0 | 3 | **Given** a person placed in two households, **When** they comment, **Then** members of both households who can see the post read it, and a member of a third household does not; they read both households' replies. |
| BETA-REPLY-10 | auto | P0 | 3 | **Given** a parent's comment or heart, **When** anyone who can see the post reads it, **Then** they see it; and a parent reads every reply on every post they can see. |
| BETA-REPLY-11 | auto | P1 | 3 | **Given** each reply scope, **When** the comment box shows and after Send, **Then** `reply_readers` names exactly the people the server allows (a test compares the names to `can_see_reply` for every member), and the app says them in words, for example "Pawpaw, Chase and Mom will read this". |
| BETA-REPLY-12 | auto | P0 | 3 | **Given** migration 0010, **When** anyone calls `set_group_replies_shared` or reads `circles.replies_shared`, **Then** the function and column are gone, `my_circles` has no `replies_shared`, and the Groups screen has no switch (Jest). |
| BETA-REPLY-13 | auto | P1 | 4 | **Given** a relative allowed to post, **When** they post, **Then** it goes to Everyone with no picker and the screen says "Everyone in the family will see this"; they read every reply on it; their own replies on it reach its audience; others' replies on it follow REPLY-7. |

**Retired when 0010 ships:** BETA-AUD-9 (group switch). BETA-AUD-8 and AUD-10 stay; REPLY-1 and REPLY-2 now point at the household rule.

**Proof it's simple (grandparent test, milestone 4):** the existing task 5 ("who else can see this photo?") stays; add nothing. A relative has no new screen to learn.

## 7. Open questions for Chase (one word each)

1. **Replies on a group post: household or whole group?** On a Charleston trip post, should Granny's comment reach Mom's sister? Recommendation: **Household.** One rule everywhere, no switch to explain; "the people who were there talk together" comes back with events or group chat, where the room is explicit.
2. **Where does a relative's post go: Everyone or household?** Recommendation: **Everyone.** It matches your 90%, needs no picker for grandparents, and only replies, not photos of the kids, were the sore spot.
3. **When you add a household to a level, do they see its past photos?** Recommendation: **Yes**, with a line on the setup step: "They'll also see the 14 photos already shared here." That's how groups work today, and it's what a grandparent joining late wants.
