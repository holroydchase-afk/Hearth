# Spec: groups v2, plain groups with comment settings

Owner: staff-pm. Oct 18, 2026. Status: **decided** (Chase, Oct 18; source: `/mnt/project-files/plans/v1-groups-plan.md`). Replaces v1 of this spec (Oct 17, "fixed shape": Everyone > set groups > households, people only in households, events link households and groups). v1 is in git history at the commit before this one.

**Supersedes the parked households-only 0013 plan** (v1 §8 item 4, "households-only placement becomes hard"). That migration is cancelled. Migration 0013 is now this spec. Chase also said Oct 18: "build everything you can without my input", which overrides TRACKER's "nothing new until milestone 1" for this work.

## Decision in two lines
A group is a plain list of people; anyone can be in several groups. Each group has a **comment setting** (Private, Shared on this group's posts, Always shared) that decides who reads a member's comments, and nothing else changes who sees a post.

## 1. What stays from v1 (built in 0011, kept)
| Kept | Where |
|---|---|
| **Everyone**, exactly one per family, first in the share sheet; only parents send to it (`can(space, 'send_to_everyone')`, `can_send_to`) | 0011, AUD-21 |
| **Roles**: Owner (`owner`), Parent (`adult`), Relative (`viewer`); all permission checks through `can(space, capability)` | 0011, v1 §4 |
| **Share history**: every add needs "Share all past photos" or "Only new photos", no default; cutoff on `published_at` only, one predicate (`private.sees_post`) | 0011, AUD-19/20 |
| **Parents see every post and read every reply**; the poster reads every reply on their post; a parent's or the poster's reply reaches everyone who sees the post | 0011, REPLY-10 |
| **Readers fixed when the reply is written**; narrowing (someone removed) is read-time | 0011, privacy item 5 |
| **`reply_readers`**: the comment box names who will read it, before Send | 0011, REPLY-11 |
| Owner's family-wide "everyone the post went to" reply setting (AUD-10) | 0009 |
| Kinds `household` and `event`, `circle_links`, `link_allowed`, `link_level`, `place_person`, `retire_level` | 0011. Kept, not removed. Households become ordinary groups by setting; links are no longer required |

## 2. The comment setting
| Setting (app words) | Who reads a member's comment or heart, besides the writer, the parents and the poster | Default for |
|---|---|---|
| **Private** | Nobody else | Everyone; new groups |
| **Shared on this group's posts** | Every member of this group, **only on posts sent to this group** | New events ("show all comments") |
| **Always shared** | Every member of this group, **on any post both can see** | Nothing. A parent turns it on (today's households) |

Why two "on" values (Chase): if a birthday group were Always shared, Meemaw's comment on an Everyone post would reach everyone at the birthday.

**Reply rule v2.** Reader R may read reply X by writer W on post P only if R can see P and one holds: R is W; R or W is a parent; R or W is P's author; the owner set "everyone the post went to"; or there is a group G that R and W were **both** in when X was written, and at X's time G was **Always shared**, or G was **Shared on this group's posts** and G was on P's audience. Effective setting = the less open of (setting when written, setting now): turning a group down narrows at once, turning it up never opens old comments. Order: Private < Shared on this group's posts < Always shared.

Fixed limits (all phases): settings decide comment readers only, never who sees a post; one check function (`private.reply_ok`); the comment box always names readers; parents set them; relatives never see any group's setting.

## 3. Acceptance criteria
Phase: **0013** = backend migration now (SQL test first, `backend/tests/groups_v2_test.sql`), **app-now** = app now (Jest/Playwright first), **later** = not now.

### Groups and comment settings (GRP)
| ID | Type | Phase | Given / When / Then |
|---|---|---|---|
| GRP-1 | auto | 0013 | **Given** the hosted data before 0013, **When** 0013 runs, **Then** the AUD-16 snapshot (`can_view_post`, `can_see_reply`, `reply_readers` for every member × post × reply) is identical before and after. No widening, no narrowing. |
| GRP-2 | auto | 0013 | **Given** 0013, **When** each existing circle is read, **Then** household → `always`, event → `on_group_posts`, group and everyone → `private`. |
| GRP-3 | auto | 0013 | **Given** Meemaw Sue and Auntie Rachel both in "Meemaw's" group (Always shared), Chase and Mom parents, and Dad's post to Everyone (Private), **When** Meemaw comments and hearts it, **Then** Chase, Mom and Rachel read both; every other person who sees the post reads neither; `reply_readers` for Meemaw names exactly Chase, Mom and Rachel. (Scenario 1) |
| GRP-4 | auto | 0013 | **Given** group "Chase's birthday" (Shared on this group's posts) and a post sent to it, **When** any member comments, **Then** every member who sees the post reads it. (Scenario 2) |
| GRP-5 | auto | 0013 | **Leak case. Given** Meemaw in "Chase's birthday" (Shared on this group's posts) and a post to Everyone only, **When** she comments, **Then** no birthday member reads it unless another rule allows (parent, poster, a shared Always-shared group). Same for a post sent to any other group. |
| GRP-6 | auto | 0013 | **Given** Meemaw in "Meemaw's" (Always shared) and a post not sent to "Meemaw's", **When** she comments, **Then** members of "Meemaw's" who can see that post read it, and members who can't see the post read nothing (the only cross-post exception). |
| GRP-7 | auto | 0013 | **Given** a comment written while its group was Private, **When** a parent switches the group to Always shared, **Then** that comment's readers don't change; a comment written after the switch follows Always shared. **And** switching Always shared → Private hides earlier comments from the group at once. |
| GRP-8 | auto | 0013 | **Given** a person added to a group after a comment was written, **When** they read the post, **Then** they don't read that comment through the group (readers fixed at write time). |
| GRP-9 | auto | 0013 | **Given** a parent, **When** they create a group or event with `create_level`, **Then** a group starts Private, an event starts Shared on this group's posts; `set_comment_mode` accepts only the three values (else `23514`); a relative calling either gets `P0002`. Everyone's setting can't be changed (`23514`): the owner's AUD-10 switch is the one way to open Everyone. |
| GRP-10 | auto | 0013 | **Given** any live group or event, **When** a parent places a person in it with `place_person(p_group, p_user, p_history)`, **Then** it succeeds (not only households); Everyone is still refused (`23514`); no history choice is `23514`. |
| GRP-11 | auto | 0013 | **Given** "Chase's side" and "Mom's side", **When** a parent calls `add_people_from(p_target, p_source, p_history)` for each into "Chase's birthday", **Then** every current member of each side is placed in the birthday group once (copied, not linked): someone added to Chase's side later is not in the birthday group. |
| GRP-12 | auto | 0013 | **Given** a parent inviting a relative, **When** `create_invite` names one or more live groups (any kind, Everyone included), **Then** redeeming places the person in each named group and in Everyone only if Everyone is named (or, for old invites, a household is named, as today). If any named group was retired, preview and redeem refuse with `22023` and the inviter's name (UX-G7). |
| GRP-13 | auto | 0013 | **Given** a relative, **When** they read `my_circles`, `circles` or any RPC, **Then** they get no comment setting and no group they're not in (AUD-14 holds). |
| GRP-14 | auto | 0013 | **Given** the reply rule, **When** `reply_ok`, `reply_scope`, `feed_rows`, `get_comments` and table RLS are compared on a table of family × post × writer × reader × expected, **Then** all agree (one helper, no copies of the group logic). |
| GRP-15 | auto | app-now | **Given** a parent on the Groups screen, **When** they tap "New group", type a name, tick people, pick a comment setting and a share-history choice, **Then** the group exists with exactly those people; all text 17pt+, targets 48pt, words "group" never "circle". |
| GRP-16 | auto | app-now | **Given** a parent making a group, **When** they tap "Add everyone from Chase's side", **Then** those people are ticked, and the screen says they're copied once ("People added to Chase's side later won't be added here."). |
| GRP-17 | auto | app-now | **Given** a parent switching a group to Always shared, **When** they tap it, **Then** a confirmation names who will read each other's comments on every post they can see, and nothing changes until they confirm. |
| GRP-18 | auto | app-now | **Given** a parent inviting someone, **When** they open the invite form, **Then** they can tick one or more groups (Everyone ticked first, can be unticked) and must pick share history. |
| GRP-19 | manual | app-now | **Given** Chase on his iPhone, **When** he makes "Chase's birthday" from both sides unaided, **Then** under 60 s, zero help. |
| GRP-20 | auto | later | Per-post "show all comments" override (rules phase 2). |
| GRP-21 | auto | later | "Comments from group A also read by group B", on any post or only posts to a chosen group (rules phase 3). |
| GRP-22 | auto | later | Nested or "keep in sync" groups (instead of copy). |

### Feature flags (FLAG)
| ID | Type | Phase | Given / When / Then |
|---|---|---|---|
| FLAG-1 | auto | 0013 | **Given** a feature with no rows, **When** `feature_on(space, feature)` is called, **Then** false (default off). |
| FLAG-2 | auto | 0013 | **Given** the global switch on and the family add-on on, **When** a relative asks for a parents-only capability, **Then** false; a parent gets true. Any one of the three off → false. |
| FLAG-3 | auto | 0013 | **Given** an app user (any role), **When** they write the global table, **Then** refused; a non-parent writing the family add-on is refused. |
| FLAG-4 | auto | 0013 | **Given** `video_posting` off for a family, **When** anyone asks `sign-media` to sign a video upload, **Then** refused (server, not only the app). |
| FLAG-5 | auto | app-now | **Given** the app, **When** it starts, **Then** it reads `my_features(space)` and `VIDEO_POSTING_ENABLED` is gone from `app/src/media/prepare.ts`; video choice hidden when off. |
| FLAG-6 | auto | app-now | **Given** every AI flag off, **When** CI builds the app bundle, **Then** no AI/ML library is in it or loaded (test lists the bundle's modules). |
| FLAG-7 | manual | later | **Given** on-phone video transcode, **When** a test video from an iPhone and an Android phone is posted, **Then** the stored file has no location (checked with exiftool) before `video_posting` is turned on globally. |

### Events (EVT)
| ID | Type | Phase | Given / When / Then |
|---|---|---|---|
| EVT-1 | auto | 0013 | **Given** a post whose audience includes an event, **When** a member of that event reads the feed or timeline, **Then** the row carries the event's id and name; a viewer who sees the post only through another group gets no event id or name (they never learn it exists). |
| EVT-2 | auto | app-now | **Given** the first post of an event, **When** a member opens Photos, **Then** it shows as a bigger event card with the event's name. |
| EVT-3 | auto | app-now | **Given** later posts to the same event, **When** a member opens Photos, **Then** each shows as one update line ("3 new photos in Chase's birthday") that opens the event, not as day-to-day cards. Open for Chase: recommendation is event posts only inside the event plus the update line. |
| EVT-4 | auto | app-now | **Given** a member of two events, **When** they open the Events section, **Then** both events are listed, newest first, each opening its posts; relatives see only events they're in. |
| EVT-5 | auto | later | Event dates, place, RSVPs, event chat (ANCHORS coordination idea). |

### Search (SRCH)
| ID | Type | Phase | Given / When / Then |
|---|---|---|---|
| SRCH-1 | auto | later | **Given** a member, **When** they search a person's name, a group, an event, a date or caption words, **Then** results are only posts `private.sees_post` allows, through `private.visible_posts`. |
| SRCH-2 | auto | later | **Given** a search, **When** it runs, **Then** the search words are never logged or sent to any analytics or AI service. |
| SRCH-3 | auto | later | **Given** a grandparent, **When** they type "Christmas 2025", **Then** photos from that date and with that caption word show. |
| SRCH-4 | auto | later | In-picture search: on the phone only, behind the AI flags (FLAG-2); no image leaves the phone. |

Cut from now: search (next migration after 0013; keeps 0013 to the access change so the GRP-1 snapshot stays reviewable), per-post override, combined rules, nesting.

## 4. Data model for 0013 (app-engineer)
1. **`circles.comment_mode text not null check in ('private','on_group_posts','always')`.** Backfill: `household` → `always`; `event` → `on_group_posts`; `group`, `everyone` → `private`. `create_level` sets `private` for groups, `on_group_posts` for events. New households still default to `always` (a household is by definition a reply circle; the v2 app doesn't create households; chief of staff, Oct 18). `set_comment_mode(p_circle, p_mode)`: parents only (`P0002`), Everyone `23514`. Revoke direct column update.
2. **`comment_mode_log (circle_id, mode, set_by, set_at)`**, trigger-written on insert and on every change; backfill one row per circle with `set_at = circles.created_at`. `reply_ok` reads the mode in effect at the reply's `p_at` and the current mode, and uses the less open (GRP-7).
3. **Membership = `circle_members`** (derived, already has `added_at`). For households this equals today's `circle_people` (nothing goes under a household), which is why GRP-1 holds. In `reply_ok` (0011 lines ~536-574) replace the household block (`kind = 'household'`, `circle_people`) and the event block (`kind = 'event'`) with one: exists G in P's space, live, with R and W both in `circle_members` of G, `added_at <= p_at` for both, and effective mode `always`, or `on_group_posts` with G on P's audience (`pa.added_at <= p_at`). Keep the reader-could-see-it check (`v_since`) as is. `reply_scope` and `private.feed_rows` call the same helper `private.group_reply_ok(...)` (GRP-14); no kind checks remain in reply logic except Everyone.
4. **People in any group.** `tg_people_check`: allow any live non-Everyone circle (was household only). `rebuild_members`: base set reads `circle_people` for any non-Everyone kind. Everyone stays `space_members.in_everyone`.
5. **Copy, not link.** `add_people_from(p_target, p_source, p_history)`: inserts `circle_people` rows for the source's current `circle_members` (minus parents), one share-history choice, one transaction. No `circle_links` row.
6. **Links no longer required.** Keep `circle_links`, `link_allowed`, `link_level`, `unlink_level` and the loop check unchanged (existing side → household links keep working). The app doesn't make links.
7. **Invites to any groups.** `create_invite` for a viewer: `p_circle_ids` = one or more live circles in the space (any kind); history still required. `redeem_invite`: `circle_people` row per named non-Everyone circle; `in_everyone = true` if Everyone is named, **or** a household is named on an invite made before 0013 (`invites.household_means_everyone`, set at creation; PRIV-G2). A new invite naming only a household does not add Everyone; the app names Everyone (ticked by default, GRP-18). Drop the legacy direct-`circle_members` path for new redemptions. `invite_places`: true if role ≠ viewer, or every named circle is live (S-0011-3's "nothing linked under it" check goes: being in a group never meant more than that group's posts).
8. **Rules phase 3 room.** Later migration creates `comment_rules (id, space_id, from_circle, to_circle, posts 'any'|'to_circle', post_circle, made_by, made_at, ended_at)`. Each `comment_mode_log` row converts 1:1: `always` → (G, G, any); `on_group_posts` → (G, G, to_circle G); `private` → ends the previous rule. `circles.comment_mode` then becomes a view of the live self-rule. `reply_ok` is the only reader to change.
9. **Tests first:** `backend/tests/groups_v2_test.sql` (GRP-2..14, FLAG-1..4), AUD-16 snapshot rerun for GRP-1, `backend/tests/integration` contract test for `set_comment_mode`, `add_people_from`, multi-group `create_invite`. `docs/eng/API.md` and `docs/architecture/05-access-control.md` updated in the same PR (rule 6).

## 5. Feature flags (0013)
Three switches, **all** must be on; server enforces; default off; with flags off no AI code runs and nothing leaves the phone.
| Switch | Table / function | Who sets it |
|---|---|---|
| Global kill switch per feature | `feature_flags (feature primary key, enabled bool default false)` | Hearth only (service role / SQL). No app grant |
| Family add-on | `space_features (space_id, feature, enabled, set_by, set_at)` | A parent (`can(space,'family_settings')` for AI features) |
| Who may use it | `can(space, capability)` gains feature capabilities (`use_video`, later `use_ai_search` ...); parents only to start | Role today; `member_grants` later |
One function `private.feature_on(space, feature)` = all three; `my_features(space)` returns the list for the app. **`VIDEO_POSTING_ENABLED` moves onto it** as feature `video_posting`: `sign-media` refuses video when off (FLAG-4); global switch stays off until FLAG-7 passes.

## 6. Order of work
1. qa-tdd: failing tests for GRP-1..14, FLAG-1..4, EVT-1.
2. privacy-security: review §2 rule and §4 items 3, 7 before the migration merges.
3. app-engineer: 0013, then app-now items (GRP-15..19, FLAG-5..6, EVT-2..4).
4. grandparent-ux: words for the three settings, the Always-shared confirmation, the copy note, the event card and update line.

AUD-13 (link rules) still holds for links. AUD-19's "names one household" and v1 §6's household and event rules are replaced by GRP-10, GRP-12 and §2. AUD-22 ("New event" screen) is covered by GRP-15/16.
