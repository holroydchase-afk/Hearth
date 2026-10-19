-- 0014: ONB-3 / ONB-4. Invite links open the hosted web build's join screen.
--
-- Until now create_invite built links from 'https://hearth.family/i/' (0002), a domain Hearth doesn't own
-- (docs/product/ACCOUNTS.md: not bought) on a path the app has no route for. Whoever bought the domain would
-- receive live invite tokens. The link becomes <hosted web build>/join/<token>:
--   * /join/[code] is the app's one join route; it passes the path segment to invite_preview and redeem_invite,
--     which already accept the 10-letter code or the 160-bit link token (0002, private.invite_hash). No new
--     route, no new secret type, no new redemption path; the token stays unguessable (BETA-JOIN-4).
--   * The token is still in the URL path, so the web host can log it. ONB-6 (milestone 2) moves it after '#'.
-- create_invite (0013) is unchanged: it still returns invite_link_base || token.
-- When the domain is bought (ONB-8, after the name is final) a later migration changes this one value.

update private.secrets
   set value = 'https://thefreighttrains-team-hearth.expo.app/join/'
 where name = 'invite_link_base';
