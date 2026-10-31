# 5. Access control

Who can see a post, who can send to whom, and who reads a reply. The short version: **every read of a post, its photos and its replies goes through one database function, `private.sees_post`, enforced by Postgres row-level security (RLS), and a post you can't see behaves exactly like a post that doesn't exist.** Status labels follow [README.md](README.md): **Built**, **Planned**, **Gap**.

## Terms

- **Family space** (`spaces`): one family's photos. A split family is two spaces, one per household of parents, so one side never sees the other side's groups, relatives or posts (`backend/supabase/migrations/0001_init.sql` header). A child can be linked to both.
- **Roles** (`space_members.role`): `owner` (the person who made the space), `adult` (another parent) and `viewer` (a relative). "Parents" means owner and adult.
- **Containers** (`circles`, with `kind`): **Everyone** (one per space), **groups** (for example, one per side of the family), **households** (one grandparent's house) and **events** (a trip, a birthday). The app calls them all "groups"; the code calls them circles.
- **Audience** (`post_audiences`): the containers a post is shared to. A post always names at least one.

## The family shape (Built, migration 0011)

| Link | Allowed | Meaning |
|---|---|---|
| household → group | Yes | Gammy's house sits under Chase's side |
| household → event | Yes | A house that came to the Charleston trip |
| group → event | Yes | A whole side invited to a birthday |
| anything else | No | Refused by one check, `private.link_allowed`, in a trigger, so a direct insert can't bypass it |

People are placed in containers (`circle_people`); containers are linked to containers (`circle_links`). Who is in each container (`circle_members`) is **derived by trigger in the same transaction**, never written by the app, so membership can't drift from the shape. Everyone holds the parents and every relative whose invite named Everyone (or, for an invite made before migration 0013, a household).

**Plain groups (Built, migration 0013).** Since `0013_groups_v2.sql` a person can be placed in any live group, household or event, not only a household, and anyone can be in several. Only Everyone refuses a placement (its members come from the invite). Links are kept and still work but are no longer needed: `add_people_from(target, source, history)` copies the relatives currently in one group into another in one transaction, so someone added to the source later is not added to the copy. An invite can name one or more live groups; redeeming places the person in each and in Everyone only if Everyone is named. An invite that names a group retired since is refused (`22023`).

## Who sees a post (Built)

`private.sees_post(user, post)` in `0011_family_shape.sql` is true when the post isn't deleted, the user is still a member of the family space, and one of these holds:

1. The user wrote it.
2. It's published and the user is a parent of that family. Parents see every published post in their space. This is checked from the role at request time, so a demoted parent loses it at once.
3. It's published and the user is a member of a live container on its audience, and the post passes that membership's share-history cutoff (below).

The same function is behind RLS on posts, photos (`media_items`), comments and hearts; the feed and timeline (`private.visible_posts`); photo download links (`sign-media` calls `can_view_post` before signing anything); and who gets a notice. One predicate means one place to review and test.

**Not-found, not forbidden.** A post you can't see returns the same error code as one that doesn't exist (`P0002`, "post not found"), and photo download links answer the same way for both, so probing ids reveals nothing (`CLAUDE.md` rule 2).

**Share history.** When someone is invited or placed, a parent chooses "Share all past photos" or "Only new photos" (`invites.history`; no default). The choice is stored as a cutoff (`sees_from`: null for all, else the moment they were added). The cutoff compares the post's share date (`published_at`), never the date a photo was taken, so an old photo shared today is "new". Through one path the latest cutoff wins; across several paths the earliest does.

## Who can send (Built)

One permission check, `public.can(space, capability)`, decides `post`, `send_to_everyone`, `make_events`, `invite`, `set_up_family`, `family_settings` and (0013) `use_video`. Only parents send to Everyone, make events or invite; only the owner changes family settings. Relatives post only when the family allows it (`viewers_can_post`, off by default) and only to containers they are in. `can_send_to(circle)` applies this in `create_post`, `publish_post` and the RLS policy on `post_audiences`, so the API and a direct table insert give the same answer.

## Who reads a reply (Built, migration 0013)

A comment or heart is read only by people who can see the post, and among them by the parents, the post's author, the writer, everyone if the owner turned that on, or people a **group's comment setting** lets read it. Each group has one setting (`circles.comment_mode`), chosen by a parent with `set_comment_mode`:

| Setting | Who else reads a member's reply |
|---|---|
| Private (`private`) | Nobody. Default for Everyone and new groups |
| Shared on this group's posts (`on_group_posts`) | Every member of the group, only on posts sent to that group. Default for new events |
| Always shared (`always`) | Every member of the group, on any post both can see. What households did before 0013 |

Reactions (hearts, and since 0017 ❤️ 😂 👍) change only through `set_reaction` and `toggle_heart`: since 0018 an app user can't insert or update the `reactions` table directly, and the table itself refuses any other emoji, so the three-emoji list and the "replies off" switch can't be skipped (HARD-12).

The settings decide who reads replies, never who sees a post. Everyone's setting can't be changed; the owner's family-wide switch is the only way to open it. One function, `private.group_reply_ok`, holds the group rule, and every reader of replies uses it: `private.reply_ok` (behind RLS on comments and hearts, `get_comments`, `can_see_reply` and `reply_readers`), `reply_scope`, and the feed and timeline counts (`private.feed_rows`).

Readers are **fixed when the reply is written**. Both people must have been in the group by then, the post must already have been sent to the group (for "Shared on this group's posts"), and the reader must already have been able to see the post. A trigger logs every setting with the moment it took effect (`comment_mode_log`); a reply is judged by the **least open** setting the group had at any point from when the reply was written until now (`private.least_open_since`), so turning a group down hides earlier replies at once and turning it up, even back up, never opens them. A change is timed when it is logged (`clock_timestamp()`), not when its transaction began. Times that decide this (a heart's time, an audience row's time, a setting's time) can't be set by the app. The comment box shows the names of who will read it (`public.reply_readers`).

Relatives can't read any group's setting: the column isn't granted to signed-in users and the log is visible only to parents, who get the setting from `my_circles`. Migration 0013 set households to Always shared and events to Shared on this group's posts, which is exactly the household and event rule it replaced; `backend/tests/grp1/` checks that it changed nobody's access.

## Feature switches (Built, migration 0013)

A feature such as video posting is on for someone only when three switches are all on (`private.feature_on`): a global switch per feature (`private.feature_flags`, which no app user can read or write), the family's add-on (`space_features`, which only the family's owner can write: `can(space, 'family_settings')`), and `can(space, capability)` for the person (video posting: `use_video`, parents only). Every switch defaults to off. The app reads its list from `my_features(space)`. The server enforces it: `prepare_media_upload` and the `media_items` insert trigger (so a direct table insert too) refuse an app user's video with `42501 video_posting_off`, and `sign-media` then signs nothing.

**Off-switches (Built, migration 0016).** The photo helpers (`photo_helpers_duplicates`, `photo_helpers_screens_blur`; `SPEC-PHOTO-HELPERS.md` HELP-R4) use the same three switches with the opposite default: a missing global or family row means on (`private.feature_default_on`), and the capability is `post`, so a viewer who can't post never gets them. Hearth's global row is a kill switch; the family's owner can turn either off, from the "Photo helpers" card on Me (HELP-R6, Oct 31). Nobody else sees the card, and the server refuses anyone else's write under RLS (42501). The rows hold only on/off: the helpers run on the phone and the server never learns anything about a photo (HELP-R2). The app treats every feature as off until `my_features` answers, so a failed read leaves the helpers off too.

**Changing a post's words (migration 0021).** Only the sender, through `edit_post_words`, and only while they can still send to at least one of the post's groups (`can_send_to`); someone who can't see the post, or a sender removed from the family, gets "not found". App users can no longer `UPDATE` a post's caption or date directly (HARD-18), so every change carries the "Edited" mark.

**Event names.** A feed or timeline row carries the event a post was sent to (`event_id`, `event_name`) only for that event's members and the parents; anyone who sees the post through another group gets nulls and never learns the event exists.

## Who sees a name (Built)

A relative's profile (display name) is visible to the people they share a family space with as a parent, to people in a live group with them (`public.can_see_profile`; a deleted group, or a deleted family space, no longer counts, migration 0012, S13), and to whoever can read one of their replies. Only a family space's parents can unlink a child from that space; a co-parent who is a viewer there can't (migration 0012, S11).

## Who is in a chat (Built, migration 0015)

A group's or event's chat holds the group's members plus the family's parents; households have no chat. Anyone else gets "not found". Relatives see a plain group's chat titled by its people, not its name. Details in [06-messenger.md](06-messenger.md); tests in `backend/tests/chat_test.sql`.

## How it's tested (Built)

- `backend/tests/rls_test.sql` (120 checks), `backend/tests/groups_test.sql` (167) and `backend/tests/groups_v2_test.sql` (108): each rule in both directions, the allowed person sees it and the excluded person doesn't, including grandparent and co-parent separation. The v2 suite also checks that `get_comments`, table RLS, `reply_ok`, the feed counts and `reply_scope` agree for every person and every reply.
- `backend/tests/aud16/` (BETA-AUD-16): a who-sees-what snapshot before 0011 and after; 0011 changed nobody's access. `backend/tests/grp1/` (GRP-1) does the same for 0013, including who reads every reply.
- `backend/tests/privacy_audit_test.sql`: the invite rate limit keeps no raw IP address (PRIV-1); S11 and S13 above.
- CI runs the SQL suites on a real local Supabase stack (`backend/tests/run_supabase.sh`), not only on a stand-in.

## What Hearth's server can see

RLS limits what each family member's app can read. It does not limit Hearth's server: the service role, the edge functions and anyone with database access read every row, including captions and comments (see [04-threat-model.md](04-threat-model.md)).

## Limits

- **Gap: parents see everything.** By design, both parents see every post in their family space, including a relative's post to one household.
- **Gap: legacy direct memberships.** Members from before 0011 keep "direct" rows (`circle_members.derived = false`) so nobody's access changed. Since 0013 no new direct rows are written; invites place people through `circle_people`.
- **Gap: "Always shared" crosses posts.** A member of an Always-shared group reads the other members' replies on any post both can see, including posts sent to other groups. That is the setting's purpose, but a parent should choose it knowingly (the app's confirmation is Planned, GRP-17).
- **Gap: "Seen by N of M"** on your own posts shows engagement, which conflicts with anchor A2 Guilt-free (tracker D4).
- **Planned:** event dates (`starts_on`, `ends_on`) exist in the schema but the app doesn't use them yet.

---
Last checked against code: 2026-10-31, HELP-R6 (the owner's photo helpers switch writes `space_features` under RLS; no migration); earlier 2026-10-29, migration 0021 (words change only through edit_post_words); earlier 2026-10-28, migration 0018 (reactions only through RPCs); earlier 2026-10-22, 10001df (plus migrations 0013, 0015, 0016)
