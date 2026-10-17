# get_feed / get_timeline scale test: results

## Oct 17, 2026 run (migration 0010)
`tests/perf/run.sh` on the same fixture shape, now with `taken_at` on 70% of posts. Raw output: `tests/perf/last-run.txt`.

| scenario (p95 ms, 200 calls, limit 20) | get_feed | get_timeline |
|---|---:|---:|
| viewer, first page | 8.40 | 9.93 |
| viewer, deep page | 9.22 | 14.09 |
| author, first page | 13.02 | 11.17 |
| author, deep page | 13.49 | 10.49 |
| co-parent, first page | 7.45 | 6.07 |

- **get_feed: pass** (target 30 ms). Before 0010 it measured about 50–60 ms p95 here: 0009's per-row reply helpers (`can_see_reply`, `reply_scope`, `can_view_post`) were SQL functions, re-planned on every call. 0010 makes them plpgsql (same bodies), which caches the plans.
- **get_timeline: misses the 5 ms target** (6–14 ms p95). Finding the page (`private.visible_posts`, index scans on `post_audiences_timeline_idx` and `posts_author_timeline_idx`) takes about 0.6 ms. The rest is the shared row builder (`private.feed_rows`): `reply_scope` is about 0.25 ms per post, so 20 posts cost about 5 ms on their own. Reaching 5 ms would mean working out the reply rule for the whole page at once instead of per post. That's a privacy-rule change, so it's left for a staff-pm / privacy-security call.
- The gate in `run.sh` stays honest: it exits 1 while a get_timeline p95 is 5 ms or more.

## Oct 15, 2026 run (before 0009)

**Run:** Oct 15, 2026 · `tests/perf/run.sh` (fixture `generate.sql`, benchmark `bench.sql`). Raw output from the last run: `tests/perf/last-run.txt`.
**Target (docs/eng/API.md):** p95 under 30 ms in the database, for a viewer in a space with 20,000 posts, on about 1M posts across about 50k spaces.
**Result: pass.** The worst p95 was 1.94 ms (author, first page). The viewer p95 was 0.61 ms on the first page and 0.69 ms on the deep page.

## Machine
PostgreSQL 16.15 with default settings (`shared_buffers` 128 MB, `work_mem` 4 MB), on 2 vCPU and 7 GB RAM. That is roughly the size of a small Supabase instance. Timings are measured inside the database (`clock_timestamp()` around each call). They don't include network or PostgREST.

## Fixture
| spaces | posts | post_audiences | media_items | circle_members | hot space posts | posts visible to the viewer | DB size |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 50,000 | 1,000,000 | 1,100,000 | 1,250,000 | 300,041 | 20,000 | 17,986 | 2.0 GB |

- **Hot space ("Big family"):** 1 owner and 32 relatives across 3 circles (Everyone, Grandparents, Co-parent). It holds 20,000 posts spread over about 3 years. 60% go to Everyone, 30% to Grandparents and 10% to Co-parent, and every 7th post also goes to Grandparents.
- **Every other space:** an owner, 2 grandparents and a co-parent, with about 20 posts each.
- **Everywhere:** 1% of posts are soft-deleted and 0.5% are drafts. Posts carry 1 or 2 media items (1 in 9 is a video).
- **Hot-space activity:** hearts, comments and seen receipts.
- **Build time:** 184 s using `generate_series`, with triggers off and derived columns filled set-wise.

## Latency: 200 calls per scenario after 5 warm-up calls, `p_limit` 20
| scenario | p50 ms | **p95 ms** | p99 ms | max ms |
|---|---:|---:|---:|---:|
| viewer (grandparent in Everyone + Grandparents), first page | 0.46 | **0.61** | 0.78 | 0.89 |
| viewer, deep page (cursor at visible post #15,000) | 0.46 | **0.69** | 0.97 | 2.25 |
| author, first page | 1.59 | **1.94** | 2.37 | 2.63 |
| author, deep page (cursor at own post #19,000) | 1.57 | **1.84** | 2.85 | 2.95 |
| co-parent (sees 10%), first page | 0.41 | 0.69 | 0.73 | 0.76 |
| co-parent, deep page (#1,800) | 0.41 | 0.66 | 0.75 | 0.81 |
| viewer in a typical small space | 0.41 | 0.49 | 0.66 | 0.71 |

The deep page costs the same as the first page because the keyset seeks straight to the cursor: there is no OFFSET.

## EXPLAIN (ANALYZE, BUFFERS)
These come from `auto_explain` with nested statements on, since a plpgsql function only shows up as a "Function Scan" from the outside. Each row is a single cold-ish call with instrumentation on, so it's slower than the timed runs.

| scenario | inner query | buffers |
|---|---:|---|
| viewer, first page | 1.61 ms | shared hit=277 read=42 |
| viewer, deep page | 1.06 ms | shared hit=279 read=28 |
| author, first page | 3.43 ms | shared hit=2635 read=54 |
| author, deep page | 3.19 ms | shared hit=2552 read=57 |

The plan shape is the same in all four cases. There are no sequential scans anywhere.
1. One index probe each on `space_members`, `circles` and `circle_members` finds the caller's circles in the space (2 for the viewer).
2. Per circle: `Index Only Scan using post_audiences_feed_idx` (circle_id, feed_at desc, post_id desc). The keyset is the index condition `(feed_at, post_id) < (cursor)`, with `Limit 20`.
3. The caller's own posts: `Index Only Scan using posts_author_feed_idx`, also with `Limit 20`.
4. HashAggregate (dedup), then sort 40 rows and keep 20. After that come primary-key lookups into `posts` and `profiles`, plus per-post media, `i_hearted` and comment/heart counters. All of it runs in the same statement, in one round trip.
5. For authors only: audience, `reach_count` and `seen_count`. This step drives the author's ~2.6k buffer hits: about 28 audience members times a circle lookup, for each of the 20 posts.

## What changed to get here
| iteration | change | viewer p95 first page / deep page | author p95 first page / deep page |
|---|---|---:|---:|
| 1 | `feed_at` denormalized onto `post_audiences`, with partial index `(circle_id, feed_at desc, post_id desc)` and `posts_author_feed_idx`; get_feed fans in over the caller's circles | 3.60 / 3.34 | 3.26 / 3.10 |
| 2 | Author-only audience/seen/reach subqueries gated by a one-time filter. Viewers had been paying for them: 2.6k of their 2.9k buffer hits. | **0.61 / 0.69** | **1.94 / 1.84** |

For comparison, the 0001-style reads on the same fixture, top 20 by `published_at` (p50 / p95, 50 calls each):

| approach | viewer | co-parent (sees 10%) |
|---|---:|---:|
| `select … from posts` through the rewritten RLS policy | 1.11 / 1.21 ms | 2.15 / 4.52 ms |
| per-row `can_view_post(id)` filter on `posts_feed_idx` | 2.48 / 2.64 ms | 3.58 / 5.14 ms |

Both naive versions get slower the less of the space a person can see, because they scan the space's posts until 20 rows pass the filter. `get_feed` reads at most `limit` rows per circle, so its cost doesn't depend on how many posts the caller is excluded from.

## Caveats
- **The fixture is synthetic.** Real families will have far fewer than 20k posts per space for years. This test checks the shape of the plan, not a capacity plan.
- **These are database-only numbers.** PostgREST, the gateway and the network add their own overhead on top, and this test doesn't measure that.
- **The timings measure a warm cache,** because each scenario runs 5 warm-up calls first. A cold call (first after a restart) took about 8 ms.
- **Rerun with `tests/perf/run.sh`.** It exits 1 if any p95 is 30 ms or more. Use `KEEP=1` to rerun only the benchmark on an existing fixture.
