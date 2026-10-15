# Family Photo App — Day-1 Stack, Cost & Market Research

Prepared Oct 15, 2026. Prices were taken from vendor pages fetched on this date unless marked otherwise. **[UNVERIFIED]** marks anything I could not confirm from a primary or current source.

---

## 0. Verdict on the proposed stack

| Layer | Proposed | Verdict |
|---|---|---|
| App + web viewer | Expo / React Native (+ web export) | **Keep.** EAS Free covers early builds. Push is free. |
| DB / Auth / RLS | Supabase, US region | **Keep, with one caveat.** Pro ($25) is required for production because Free pauses and has no backups. Supabase **cannot promise that 100% of processing stays in the US** (see §4). MAU overage becomes the second-largest cost at 50k families. |
| Media objects | R2 vs B2 vs Supabase Storage | **Use Backblaze B2 (US East) as the primary store, behind an S3-compatible abstraction. Keep R2 `us` jurisdiction as the fallback.** B2 storage costs 54% less than R2, and our view pattern stays inside B2's free-egress allowance. **Reject Supabase Storage for media:** its egress costs $0.09/GB and its CDN caches outside the region. |
| Push | Expo Push | **Keep.** It's free. Don't put kid names or image URLs in payloads. |
| Email | Resend vs SES | **Start on the Resend free tier, then move to SES at roughly 3k emails/mo.** SES costs $0.10/1k vs Resend's $0.90/1k overage. |

---

## 1. Infrastructure pricing (current)

### Supabase (supabase.com/pricing)
| | Free | Pro ($25/mo) |
|---|---|---|
| MAU | 50,000 | 100,000, then **$0.00325/MAU** |
| DB disk | 500 MB/project | 8 GB, then $0.125/GB |
| File storage | 1 GB | 100 GB, then $0.0213/GB |
| Egress | 5 GB uncached + 5 GB cached | 250 GB + 250 GB, then $0.09/GB uncached, $0.03/GB cached |
| Max upload | 50 MB | 500 GB (as listed) |
| Pausing | **Paused after 1 week inactivity**; 2 free projects | Never paused |
| Backups | None | Daily, 7-day retention (PITR is $100/mo extra) |
| Compute | Nano | $10/mo credit covers Micro. Small ~$15, Medium ~$60, Large ~$111, XL ~$210 |
| Edge Functions | 500k invocations | 2M, then $2/M |
| Image transforms | — | 100 origin images, then $5/1k |

Spend cap is on by default on Pro.

### Cloudflare R2 (developers.cloudflare.com/r2/pricing)
| | Standard | Infrequent Access |
|---|---|---|
| Storage | **$0.015/GB-mo** | $0.01/GB-mo (30-day min, $0.01/GB retrieval) |
| Class A (writes/lists) | $4.50/M | $9.00/M |
| Class B (reads) | $0.36/M | $0.90/M |
| Egress | **Free** | Free |
| Free tier (Standard only) | 10 GB-mo, 1M Class A, 10M Class B | — |

**US-only storage: guarantee vs hint**
- **Location hints** (`wnam`, `enam`, etc.) are "a best effort and not a guarantee." They are not acceptable for our requirement.
- **Jurisdictional restriction `us`** shipped **Aug 17, 2026**. Per the changelog, it "guarantees that bucket data is stored and processed within the United States." It is set at bucket creation, can never be changed, and is reached via `https://<ACCOUNT_ID>.us.r2.cloudflarestorage.com`. The rate card shows no price premium.
- **Caveats:**
  - Presigned URLs "cannot be used with custom domains." They only work on the S3 API endpoint.
  - The docs don't explicitly confirm presigned URLs on the `us` jurisdiction endpoint **[UNVERIFIED — test it]**.
  - Serving through a custom domain uses Cloudflare's global cache. Pinning TLS termination and cache to a region requires **Regional Services**, which is an **Enterprise add-on**. So don't put a public custom domain plus cache in front of kids' media.
  - `r2.dev` is rate-limited and dev-only.
  - Logpush doesn't work with jurisdictional buckets.
  - Older bucket-scoped tokens won't reach `us` buckets (third-party writeup).

### Backblaze B2 (backblaze.com/cloud-storage/pricing)
- Storage costs **$6.95/TB-mo (~$0.00695/GB)**. The first 10 GB is free. There are no minimum-duration or minimum-size fees.
- Egress is **free up to 3× the average monthly stored data**, then $0.01/GB. Egress through CDN partners (Cloudflare, Fastly, bunny.net, …) is free.
- API Classes A, B, and C are **free**. Class D (event notifications) has 2,500 free calls/day, then $0.004/10k.
- **Regions:**
  - US East: Reston, VA
  - US West: Sacramento, CA + Phoenix, AZ
  - EU and CA regions also exist.
  - The region is chosen at account creation and is **permanent for the account**. A US-region account therefore keeps data in the US by construction.
- I did not verify that the B2 S3 API supports presigned URLs in this session. It's widely documented **[UNVERIFIED here]**.

### Supabase Storage
- Costs $0.0213/GB-mo, plus egress at $0.09/GB uncached or $0.03/GB cached beyond 250 GB.
- Objects live in the project region, **but "content may be cached or served through a global CDN outside your region."**
- It's fine for avatars, not for media at scale (see §6).

### Cloudflare Workers (only needed if proxying media)
- Free plan: 100k requests/day.
- Paid: $5/mo minimum, including 10M requests and 30M CPU-ms; then $0.30/M requests.

## 2. Expo and the app stores
- **EAS Free:**
  - 15 Android + 15 iOS builds/mo
  - **1,000 OTA-update MAUs**
  - 45-min build timeout, low-priority queue
- **EAS paid plans:**
  - Starter: $19/mo + usage ($45 build credit, 3,000 update MAUs)
  - Production: $199/mo (50,000 update MAUs)
  - Overage rates are not listed on the page **[UNVERIFIED]**.
- **Expo Push:**
  - Free; "no cost associated with sending notifications."
  - Limit of 600 notifications/sec/project.
  - Content is held only in memory and queues for delivery, not in databases.
- **Apple Developer Program:** **$99/yr**. The App Store Small Business Program commission is 15%.
- **Google Play:**
  - **$25 one-time** registration fee.
  - New *personal* accounts must run a closed test with **12 testers for 14 days** before production. Register as an organization (needs a free D-U-N-S number) to avoid this, or plan the 2 weeks.
  - Subscription fee per a third-party source: 15%, or 10% + 5% billing fee in the US **[verify on Google's page]**.

## 3. Transactional email
| | Free | Paid |
|---|---|---|
| **Resend** | 3,000/mo, **100/day cap**, 3 domains | Pro $20/mo for 50k, then $0.90/1k |
| **Amazon SES** | No standing free quota. New AWS accounts get up to $200 in Free Tier credits within 12 months | **$0.10/1k** à la carte; attachments $0.12/GB |

- **Resend** sends from us-east-1 (also eu-west-1, sa-east-1, ap-northeast-1). Its docs say account data, logs, and metadata are "stored in the United States regardless of the sending region."
- **Recommendation:** start on Resend Free. Move to SES once volume passes ~3k/mo; at 500k/mo, SES costs $50 vs ~$425 on Resend.

## 4. AI-training and data-residency stance of vendors

| Vendor | What the terms say | Risk |
|---|---|---|
| **Supabase** | ToS (captured Sep 11, 2026, via ConductAtlas): "will not use, nor allow any third-party to use, Customer Data … to train, fine-tune, or otherwise improve any artificial intelligence or machine learning model without Customer's prior written consent." | **Low** for training. **Medium for residency.** Account and billing data use central systems outside the region. **Logs and telemetry are stored in EU data centers.** Global support staff can access data on request or during incidents. The primary processor is Supabase Pte. Ltd. (Singapore). **Auth logs contain emails and IPs, so "all user data processed in the USA" is not strictly achievable on hosted Supabase.** Decide whether "photos/videos and the DB live in the US" is the promise you make, or plan self-hosted Postgres on US infra later. |
| **Cloudflare (R2)** | The license is limited to what's needed "to provide the Services" (Terms §2.5.1). Trust Hub: "we do not train LLMs ourselves … customers never need to worry that their data is used to train LLMs." The Workers AI page says customer content isn't used to train models without explicit consent. | **Low-medium.** No R2-specific no-ML clause was found. Cloudflare owns "Network Data" (traffic metadata, not content) and can use it to improve its services. |
| **Backblaze B2** | ToS (eff. Apr 16, 2026): "permission to use the Files **solely to do what is necessary to provide and improve** our Service(s)." The Privacy Notice doesn't cover stored content. Its AI sections only disclaim the accuracy of outputs. | **Medium.** "Improve" is undefined and there is no explicit no-training clause. **Mitigation:** get a DPA or written confirmation, or encrypt objects client-side or with SSE-C so B2 never sees plaintext. |
| **Expo** | The privacy policy is silent on AI. Push content isn't persisted. EAS sees app code, not user media. | Low. Keep personal data out of push payloads, since they also transit APNs and FCM. |
| **Resend** | The privacy policy is silent on AI/ML. Data is processed in the US. | Low-medium. Keep emails content-light (no inline kid photos; link to the app). |
| **AWS SES** | AWS's content-for-improvement opt-out applies to "AWS AI services." SES isn't listed as one. | Low. **Apply the org-level AI services opt-out anyway** (a free, one-click setting). |

**Bottom line:** only Supabase has an explicit contractual no-training clause. For the others, rely on (a) the content-limited license language, (b) DPAs, and (c) **encrypting media at rest with a key we control**, which is the strongest guarantee we can make to parents.

## 5. Competitors

| App | Price | Per-post audience control | Ads / data use | AI / ML | Data location |
|---|---|---|---|---|---|
| **FamilyAlbum** (MIXI, Japan) | Free with unlimited storage; Premium One $2.99, **Premium Family $5.99/mo or $59/yr**, Family Pro $10.99/mo or $109/yr | "Share Groups" restrict an upload to a subset, but they're **Premium-only** and **only Album Admins can create them** | **In-app ads.** The privacy policy says identifiers are sold or shared with ad networks, **including data about minors under 16** | Analyzes photos and stores "feature vectors of users' faces"; some processing on-device | AWS + GCP. **Transfers to the US, Japan, and China** |
| **Tinybeans** (US/AU) | Free plan limited to 20 uploads/mo; paid ~$74.99/yr or $7.99/mo (third-party, July 2026); also "Tinybeans+ Legacy" (200 GB) | Only a per-moment "hidden" flag. **No per-circle audience** | **Free plan shows ads.** Policy: may "sell and/or share" personal info for targeted ads (Freestar) | "May use automated processes and machine learning to analyze User Content" | US ("maintained in the United States") |
| **Ente Photos** | Free 10 GB; 50 GB $2.49/mo; 200 GB $4.99; 1 TB $9.99. Family: 5 members share storage | Album-level sharing (viewer or collaborator, public links). It's a backup tool, not a family feed | No ads | E2EE; ML runs on-device only | "Stored in 3 locations." Specific locations **[UNVERIFIED — FAQ fetch blocked]**; believed to be EU-heavy |
| **Cluster** | Free with IAP; prices **[UNVERIFIED]** | Group-level (private invite-only groups) | Listing says no ads, but an SDK scan found the Facebook ad SDK plus Firebase | — | **[UNVERIFIED]** |
| **Notabli** | Gumroad subscription; price **[UNVERIFIED]**. **iOS app last updated Oct 16, 2024** (looks stagnant) | Approve-who-can-view at the account level; per-post control **[UNVERIFIED]** | Marketed as ad-free | — | **[UNVERIFIED]** |

### The gap we can own
No one combines these:
1. **Co-equal households:** two separate parent "owners" of the same child, e.g. divorced parents, each controlling *their own* posts' audience without seeing each other's circles. FamilyAlbum's model is a single album with admins, and per-subset sharing is paywalled. Tinybeans only has "hidden."
2. **Visible audience on every post:** "Seen by Grandma, Dad's side" receipts, plus a "who can see this" chip, so parents get the *visibility of interaction* that group chats lack.
3. **US-only storage, no ads, and a contractual no-AI-training promise.** The two biggest players run ads and share identifiers. FamilyAlbum transfers to China. Tinybeans runs ML on content.
4. **A free no-install web viewer for grandparents**, reached by magic link.

## 6. Cost model

### Assumptions
- **Per family per month:** 60 photos × (350 KB + 40 KB thumb) + 4 videos × (15 MB + 40 KB thumb).
- **Users:** 6 users per family (2 parents on the app, ~4 viewers). Every viewer is a Supabase MAU; ~2 per family use the native app (EAS update MAU).
- **Viewing:** each item is viewed 12× at full size (thumbnail included); full-size + thumb = 2 GETs per view.
- **Email:** 10 per family per month (invites, weekly digests).
- **Numbers below are for steady state at month 12**, i.e. 12 months of accumulated media per family.

### Per-family arithmetic
- Photos: 60 × 0.39 MB = **23.4 MB/mo**
- Videos: 4 × 15.04 MB = **60.16 MB/mo**
- **Storage growth = 83.56 MB/family/month ≈ 1.0 GB/family/year.** Video is 72% of bytes.
- Egress: photos 60 × 12 × 0.39 = 280.8 MB, videos 4 × 12 × 15.04 = 721.9 MB, so **≈1.0 GB/family/mo**.
- Writes (Class A): 64 items × 2 objects = **128/family/mo**.
- Reads (Class B): 64 × 12 × 2 = **1,536/family/mo**.
- **Egress vs B2's 3× rule:** a mature family stores ≈1 GB and egresses ≈1 GB/mo, so the ratio is ~1×, well inside 3×. New families exceed 3× in months 1–3, but overage is $0.01/GB. Example: 1,000 brand-new families ≈ 870 GB over, or $8.70. Negligible.

### Storage at month 12
- 10 families: 10 × 1.003 GB = **10.0 GB**
- 1,000 families: **1,002.7 GB**
- 50,000 families: **50,136 GB (~50 TB)**

### Variable media cost per option at month 12

| | 10 fam | 1,000 fam | 50,000 fam |
|---|---|---|---|
| **B2:** (GB−10) × $0.00695; ops and egress $0 | $0.00 | (992.7) × 0.00695 = **$6.90** | (50,126) × 0.00695 = **$348.38** |
| **R2 storage:** (GB−10) × $0.015 | $0.00 | **$14.89** | **$751.89** |
| R2 Class A: (n × 128 − 1M free) × $4.50/M | $0 | $0 (128k) | (6.4M−1M) × 4.5 = **$24.30** |
| R2 Class B: (n × 1,536 − 10M free) × $0.36/M | $0 | $0 (1.54M) | (76.8M−10M) × 0.36 = **$24.05** |
| **R2 total** | $0 | **$14.89** | **$800.24** |
| Supabase Storage: storage (GB−100) × 0.0213 + egress (GB−250) × 0.09 | ~$0 | $19.23 + (1,003−250) × 0.09 = $67.74 → **$86.97** | $1,065.77 + $4,489.74 → **$5,555.51** |

### Full monthly cost, recommended stack (B2 media)

| Line item | 10 fam | 1,000 fam | 50,000 fam |
|---|---|---|---|
| Supabase Pro base (incl. Micro compute) | $25 | $25 | $25 |
| Compute upgrade (Large $111 − $10 credit) | — | — | $101 |
| Supabase MAU (6/fam; 100k incl., $0.00325 after) | $0 (60) | $0 (6k) | (300k−100k) × 0.00325 = **$650** |
| DB disk (~38M media rows/yr ≈ 19 GB, est.) | $0 | $0 | (19−8) × 0.125 ≈ $2 |
| Edge Functions (URL signing, ~100 calls/fam/mo) | $0 | $0 | (5M−2M) × $2/M = $6 |
| B2 media | $0 | $6.90 | $348.38 |
| Email (10/fam) | Resend free ($0) | SES 10k × $0.10/1k = $1 | SES 500k → $50 |
| EAS (update MAU ≈ 2/fam) | Free ($0) | Starter $19 (2k > 1k free) | Production $199 (100k MAU; overage **[UNVERIFIED]**) |
| Apple $99/yr | $8.25 | $8.25 | $8.25 |
| Expo Push | $0 | $0 | $0 |
| **Total / month** | **$33.25** | **$60.15** | **$1,389.63** |
| **Per family / month** | **$3.33** | **$0.060** | **$0.028** |

- **R2 instead of B2:** totals are $33.25 / $68.14 / $1,841.49.
- **Supabase Storage instead:** totals are roughly $140 at 1k families and ~$6.6k at 50k. Not viable.

### Notes on the model
- **Fixed costs:** $33.25/mo (Supabase Pro + Apple), plus a $25 one-time Google fee.
  - EAS Starter ($19) becomes necessary once update MAU exceeds 1,000. Alternatively, disable OTA updates and stay on EAS Free.
  - During private beta you can run Supabase Free for $8.25/mo all-in, but it pauses after 7 days idle and has no backups.
- **Storage compounds.** Each year of tenure adds ~1 GB per family, i.e. +$0.007/mo on B2 or +$0.015/mo on R2. Year-5 media cost per family on B2 is ≈ $0.035/mo. Still tiny, but "unlimited free forever" is an uncapped liability, so cap free *video*.
- **At 50k, Supabase MAU ($650) is the single largest line.** Lever: let grandparents view via signed, expiring digest links that don't require an auth session **[design choice; weigh against privacy]**. Or self-host GoTrue/Postgres later.

## 7. Recommended pricing

| Plan | Price | Includes |
|---|---|---|
| **Free** | $0 | Unlimited photos (≈0.28 GB/yr ≈ $0.002/mo on B2); **10 videos/mo ≤30s**; up to 3 circles; web viewer for grandparents; no ads, ever |
| **Family** | **$4.99/mo or $39.99/yr** | Unlimited 60s/720p video (1080p later); unlimited circles; **co-parent household linking** (two independent owners); "seen by" receipts; full export; 2 parent seats |
| (Later) Gift / Grandparent | $29.99/yr | A relative pays for a family's plan, which is a natural gift for split families |

**Why these numbers**
- **Undercut the competition.** FamilyAlbum Premium Family is $59/yr and Tinybeans ~$75/yr, so we're cheaper while being the only ad-free, US-only option with per-post audiences. Ente is cheaper per GB but isn't a family feed.
- **Net revenue per payer:**
  - Annual: $39.99 × 0.85 (store fee) = $33.99/yr = **$2.83/mo**.
  - Monthly: $4.99 × 0.85 = $4.24/mo.
  - Our cost for a heavy family is **~$0.03–0.07/mo**, a gross margin above 97%.
- **Break-even payers** (at the annual net of $2.83/mo):
  - 10 families: 12 payers. Fixed costs dominate, so this is the founder's runway cost of ~$33/mo.
  - 1,000 families: $60.15 / 2.83 ≈ **22 payers (2.2% conversion)**.
  - 50,000 families: $1,389.63 / 2.83 ≈ **491 payers (≈1% conversion)**.
- **Upside:** at an assumed 5% conversion, 50k families gives 2,500 × $2.83 = **$7,075/mo revenue vs $1,390 cost**. The conversion rate is an assumption, not data.
- **Don't paywall basic circles.** The split-family wedge must work on Free to spread through both households. Monetize volume (video), co-parent linking, receipts, and export.

## 8. Action items
1. Create the B2 account in **US East (Reston)**. The region is permanent. Encrypt objects with SSE-C or client-side keys. Request Backblaze's DPA and written no-ML-use confirmation.
2. Keep storage access behind an S3 interface so you can switch to an R2 `us` jurisdiction bucket. Test presigned URLs on the `us` endpoint before relying on them.
3. Supabase Pro in a US region. Accept and disclose that logs and support access may be non-US, or plan self-hosting.
4. Register Google Play as an **organization** to skip the 12-tester/14-day gate.
5. Apply the AWS AI-services opt-out before using SES.
6. Serve media only via short-lived presigned URLs. Never use a public bucket or CDN custom domain for kids' media.

---

## Sources
- Supabase pricing — https://supabase.com/pricing
- Supabase billing — https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase compute — https://supabase.com/docs/guides/platform/compute-and-disk ; https://supabase.com/docs/guides/platform/manage-your-usage/compute
- Supabase data residency FAQ — https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- Supabase storage downloads — https://supabase.com/docs/guides/storage/serving/downloads
- Supabase ToS AI clause (ConductAtlas capture) — https://conductatlas.com/platform/supabase/supabase-terms-of-service/provision/CA-P-056037/supabase-will-not-use-customer-data-to-train-ai-models/ ; original https://supabase.com/terms
- Cloudflare R2 pricing — https://developers.cloudflare.com/r2/pricing
- R2 data location — https://developers.cloudflare.com/r2/reference/data-location/
- R2 US jurisdiction changelog — https://developers.cloudflare.com/changelog/post/2026-08-17-r2-us-jurisdiction/
- R2 US jurisdiction analysis — https://ecorpit.com/r2-us-jurisdiction-endpoint-lockin-token-scope-break-2026/
- R2 public buckets — https://developers.cloudflare.com/r2/buckets/public-buckets/
- R2 presigned URLs — https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Cloudflare Regional Services — https://developers.cloudflare.com/data-localization/regional-services/
- Cloudflare Workers pricing — https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Terms — https://www.cloudflare.com/terms/
- Cloudflare Responsible AI — https://www.cloudflare.com/trust-hub/responsible-ai/
- Workers AI data usage — https://developers.cloudflare.com/workers-ai/platform/data-usage/
- Backblaze B2 pricing — https://www.backblaze.com/cloud-storage/pricing
- B2 transactions — https://www.backblaze.com/cloud-storage/transaction-pricing
- B2 regions — https://www.backblaze.com/docs/cloud-storage-data-regions
- Backblaze ToS (Apr 16, 2026) — https://www.backblaze.com/company/policy/terms-of-service-2026
- Backblaze Privacy — https://www.backblaze.com/company/policy/privacy
- Expo pricing — https://expo.dev/pricing
- Expo push FAQ — https://docs.expo.dev/push-notifications/faq/
- Expo privacy — https://expo.dev/privacy
- Apple Developer membership — https://developer.apple.com/support/compare-memberships/
- Google Play fee and testing — https://magora-systems.com/google-play-developer-account-cost/ (secondary; Google's own page not fetched)
- Resend pricing — https://resend.com/pricing
- Resend regions — https://www.resend.com/docs/dashboard/domains/regions.md
- Resend privacy — https://resend.com/legal/privacy-policy
- Amazon SES pricing — https://aws.amazon.com/ses/pricing/
- AWS AI opt-out — https://docs.aws.amazon.com/accounts/latest/reference/opt-out-ai-data-use.html
- FamilyAlbum App Store — https://apps.apple.com/us/app/-/id935672069
- FamilyAlbum privacy — https://family-album.com/privacy_policy
- FamilyAlbum Share Groups — https://help.family-album.com/hc/en-us/articles/360038780473 ; https://help.family-album.com/hc/en-us/articles/360038780593
- FamilyAlbum vs Tinybeans (FamilyAlbum's own blog; biased; July 2026) — https://blog.family-album.com/blog/familyalbum-vs-tinybeans-which-is-better-after-the-price-hike/
- Tinybeans FAQ — https://tinybeans.com/faqs
- Tinybeans privacy — https://tinybeans.com/privacy
- Tinybeans help — https://tinybeans.helpscoutdocs.com/article/15-what-can-my-followers-see-on-tinybeans
- Ente — https://ente.com/ (data-location FAQ https://ente.com/help/photos/faq/security-and-privacy was blocked)
- Cluster (AppGoblin) — https://appgoblin.info/apps/596595032
- Notabli (AppGoblin) — https://appgoblin.info/apps/580644870 ; https://notabli.gumroad.com
