-- 0005: S12 / BETA-REPLY-4. An author removed from the space could still edit the
-- caption on their old posts with an unfiltered UPDATE (no WHERE skips SELECT
-- policies, so the posts_select check never ran). Require current membership.
drop policy posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated
  using (author_id = (select auth.uid()) and deleted_at is null and space_id = any ((select private.my_space_ids())::uuid[]))
  with check (author_id = (select auth.uid()) and space_id = any ((select private.my_space_ids())::uuid[]));
