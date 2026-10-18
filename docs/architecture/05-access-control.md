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

People are placed in households (`circle_people`); containers are linked to containers (`circle_links`). Who is in each container (`circle_members`) is **derived by trigger in the same transaction**, never written by the app, so membership can't drift from the shape. Everyone holds the parents and every relative who joined through a household invite.

## Who sees a post (Built)

`private.sees_post(user, post)` in `0011_family_shape.sql` is true when the post isn't deleted, the user is still a member of the family space, and one of these holds:

1. The user wrote it.
2. It's published and the user is a parent of that family. Parents see every published post in their space. This is checked from the role at request time, so a demoted parent loses it at once.
3. It's published and the user is a member of a live container on its audience, and the post passes that membership's share-history cutoff (below).

The same function is behind RLS on posts, photos (`media_items`), comments and hearts; the feed and timeline (`private.visible_posts`); photo download links (`sign-media` calls `can_view_post` before signing anything); and who gets a notice. One predicate means one place to review and test.

**Not-found, not forbidden.** A post you can't see returns the same error code as one that doesn't exist (`P0002`, "post not found"), and photo download links answer the same way for both, so probing ids reveals nothing (`CLAUDE.md` rule 2).

**Share history.** When someone is invited or placed, a parent chooses "Share all past photos" or "Only new photos" (`invites.history`; no default). The choice is stored as a cutoff (`sees_from`: null for all, else the moment they were added). The cutoff compares the post's share date (`published_at`), never the date a photo was taken, so an old photo shared today is "new". Through one path the latest cutoff wins; across several paths the earliest does.

## Who can send (Built)

One permission check, `public.can(space, capability)`, decides `post`, `send_to_everyone`, `make_events`, `invite`, `set_up_family` and `family_settings`. Only parents send to Everyone, make events or invite; only the owner changes family settings. Relatives post only when the family allows it (`viewers_can_post`, off by default) and only to containers they are in. `can_send_to(circle)` applies this in `create_post`, `publish_post` and the RLS policy on `post_audiences`, so the API and a direct table insert give the same answer.

## Who reads a reply (Built)

A comment or heart is read by the parents, the post's author, the writer, people in the writer's own household, people in an event on the post's audience they share with the writer, or everyone if the owner turned that on. Readers are **fixed when the reply is written**: a house added to a post later sees the photo, not the replies written before it joined. Times that decide this (a heart's time, an audience row's time) can't be set by the app. The comment box shows the names of who will read it (`public.reply_readers`).

## Who sees a name (Built)

A relative's profile (display name) is visible to the people they share a family space with as a parent, to people in a live group with them (`public.can_see_profile`; a deleted group, or a deleted family space, no longer counts, migration 0012, S13), and to whoever can read one of their replies. Only a family space's parents can unlink a child from that space; a co-parent who is a viewer there can't (migration 0012, S11).

## How it's tested (Built)

- `backend/tests/rls_test.sql` (120 checks) and `backend/tests/groups_test.sql` (168): each rule in both directions, the allowed person sees it and the excluded person doesn't, including grandparent and co-parent separation.
- `backend/tests/aud16/` (BETA-AUD-16): a who-sees-what snapshot before 0011 and after; 0011 changed nobody's access.
- `backend/tests/privacy_audit_test.sql`: the invite rate limit keeps no raw IP address (PRIV-1); S11 and S13 above.
- CI runs the SQL suites on a real local Supabase stack (`backend/tests/run_supabase.sh`), not only on a stand-in.

## What Hearth's server can see

RLS limits what each family member's app can read. It does not limit Hearth's server: the service role, the edge functions and anyone with database access read every row, including captions and comments (see [04-threat-model.md](04-threat-model.md)).

## Limits

- **Gap: parents see everything.** By design, both parents see every post in their family space, including a relative's post to one household.
- **Gap: legacy direct memberships.** Members from before 0011 keep "direct" rows (`circle_members.derived = false`) so nobody's access changed. Households-only placement is cancelled (Oct 18): 0013 lets people be placed in any group and gives each group a comment setting (Planned, `docs/product/SPEC-GROUPS.md` v2 §4).
- **Gap: "Seen by N of M"** on your own posts shows engagement, which conflicts with anchor A2 Guilt-free (tracker D4).
- **Planned:** event dates (`starts_on`, `ends_on`) exist in the schema but the app doesn't use them yet.

---
Last checked against code: 2026-10-18, 0fb7ad1 (plus migration 0012)
