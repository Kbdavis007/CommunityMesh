# Provider service limits and deployment constraints

Last verified: 2026-10-16

This note records the current, provider-published limits and conditions for the deployment architecture described in the OpenSpec design. It is a design-time verification artifact, not a guarantee that these limits will remain available forever or that the system can remain free/fully decentralized across providers.

## Executive summary

- Cloudflare Workers Free is a real free tier, but it is limited to 100,000 requests/day, 10 ms CPU time per request, 128 MB memory, and low daily quotas for related services. It is not a perpetual no-cost operating model and is subject to provider policy changes.
- Cloudflare Pages Free is available but limited to 500 builds/month and 20,000 files/site; function traffic counts against Workers quotas.
- Cloudflare D1 Free includes 5 million rows read/day, 100,000 rows written/day, and 5 GB storage. On Workers Free, daily read/write exhaustion blocks further queries; Workers Paid meters usage above its included allowances.
- Cloudflare R2 includes 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations each month, with no egress bandwidth charges. Creating a bucket requires adding an R2 subscription through checkout; the public setup docs do not say whether that checkout requires a payment method for every account.
- Workers AI currently includes 10,000 Neurons/day at no charge. Above that, AI inference requires Workers Paid and is billed at the current published rate; some models require a paid billing method even within the free allocation.
- Supabase Free is genuinely free for small projects but strictly bounded: 2 active projects, 500 MB DB, 50,000 MAUs, 1 GB file storage, and 5 GB egress. Free projects can be paused after inactivity and backups are not available for download.
- The architecture should treat Cloudflare + Supabase as managed providers and not assume provider-independent decentralization or indefinite free operation.

## Services checked

### Cloudflare Workers

Provider docs: https://developers.cloudflare.com/workers/platform/pricing/ and https://developers.cloudflare.com/workers/platform/limits/

Current free-tier limits from Cloudflare docs:

- Workers Free plan is the default free plan for users.
- Requests: 100,000/day
- CPU time: 10 ms per request
- Memory: 128 MB
- Subrequests: 50 per request
- Simultaneous outgoing connections per request: 6
- Related service quotas are also limited and reset daily at 00:00 UTC for applicable categories.

Important operational notes:

- The Cloudflare docs explicitly state that Workers Free includes limited usage of Workers, Pages Functions, Workers KV, and Hyperdrive.
- If a limit is exceeded, further operations of that type can fail.
- This is a limited free plan, not a guarantee of perpetual unlimited or free service.

### Cloudflare Pages

Provider docs: https://developers.cloudflare.com/pages/platform/pricing/ and https://developers.cloudflare.com/pages/platform/limits/

Current Free plan limits from the Pages limits page:

- Builds: 1 concurrent build at a time
- Builds per month: 500
- Files per site: 20,000
- Maximum file size per asset: 25 MiB
- Custom domains per project: 100
- Build timeout: 20 minutes
- Project limit: 100 projects per account

Important operational notes:

- Pages functions count against the Workers plan quota, including requests from a Function to KV or Durable Object bindings.
- Free sites are subject to provider plan limits and can require an account-level upgrade for more growth or higher usage.

### Cloudflare D1

Provider docs: https://developers.cloudflare.com/d1/platform/pricing/ and https://developers.cloudflare.com/d1/platform/limits/

Current free-tier limits from D1 pricing docs:

- Rows read: 5 million/day
- Rows written: 100,000/day
- Storage: 5 GB total included
- Compute: no billing while idle; usage is only billed when queries run

Important operational notes:

- D1 is available on both Free and Paid Workers plans.
- Docs say the Free plan will always include the ability to prototype and experiment with D1 for free.
- On Workers Free, exceeding daily read/write thresholds blocks further D1 queries until reset; exceeding storage prevents additional writes/schema operations until space is freed or the account is upgraded. Workers Paid removes daily limits and meters usage.

### Cloudflare R2

Provider docs: https://developers.cloudflare.com/r2/pricing/ and https://developers.cloudflare.com/r2/get-started/

Current free monthly usage from Cloudflare's R2 pricing page:

- Storage: 10 GB-month
- Class A operations: 1 million requests
- Class B operations: 10 million requests
- Egress bandwidth: no charge

Important activation and billing notes:

- Cloudflare's R2 setup guide requires an R2 subscription and instructs the account owner to complete a checkout flow before creating buckets.
- R2 usage above the monthly free allowances is billable. The public setup and pricing pages reviewed do not say whether the checkout flow requires a payment method for every account, and no account-specific checkout was available to verify here.
- Do not promise that R2 can be enabled without billing details or that usage above the free allowance will be blocked. Confirm the actual account's checkout requirements and billing controls before enabling the `r2_assets` bucket.
- The R2 pricing page was checked on 2026-10-16; the getting-started and bucket-creation guides were also reviewed on that date.

### Cloudflare Workers AI

Provider docs: https://developers.cloudflare.com/workers-ai/platform/pricing/ and https://developers.cloudflare.com/workers-ai/models/

Current pricing and availability status:

- Workers AI includes a free allocation of 10,000 Neurons per day, resetting at 00:00 UTC.
- Workers Free cannot use inference above the daily allocation; the request fails rather than silently becoming paid.
- Workers Paid is currently listed at $0.011 per 1,000 Neurons above the free daily allocation.
- Some models require a paid billing method regardless of the general free allocation. The current docs identify several DeepSeek and Moonshot/Z.ai models as paid-method-only.
- Model-specific Neurons-per-token vary widely; for example, `@cf/meta/llama-3.2-1b-instruct` is listed at 2,457 Neurons per million input tokens and 18,252 per million output tokens.
- Model availability can change; the model catalog is maintained by Cloudflare and is not guaranteed to remain stable across time or account tiers.
- The design must treat AI as provider-dependent and quota-limited, not as a guaranteed perpetual free service.

Important operational notes:

- The free allocation is daily, not monthly. All agents in the account should share a single daily Neurons budget.
- Any production AI workflow must verify the current model catalog, model availability, and token consumption before deployment.
- The architecture cannot assume the AI layer remains free or provider-independent.

### Supabase

Provider docs: https://supabase.com/pricing, https://supabase.com/docs/guides/platform/billing-on-supabase, and https://supabase.com/docs/guides/platform/going-into-prod

Current Free plan limits from Supabase pricing docs:

- $0/month
- 2 active projects per account
- 50,000 monthly active users (MAU)
- 500 MB database size
- Shared CPU and 500 MB RAM
- 5 GB egress
- 5 GB cached egress
- 1 GB file storage
- Community support

Operational caveats in the provider docs:

- Free projects are paused after 1 week of inactivity.
- The docs say the Free Plan can pause applications that exhibit low activity in a 7-day period to save server resources.
- Free projects are subject to a project limit and inactivity pause behavior.
- Database backups are not available for download on the Free Plan.
- The docs describe the Free plan as a starting point, not a production guarantee.
- Supabase billing docs state that projects in a paid organization are not paused for inactivity. The Free plan should therefore not be used where guaranteed continuous availability or provider-managed downloadable backups are required.

Important account and payment requirements:

- Cloudflare's Workers pricing page says users have access to the Workers Free plan by default; Workers Paid starts at $5/month/account. The public pricing page does not state a universal payment-method requirement for every account's free-plan provisioning.
- Cloudflare's R2 setup guide requires adding an R2 subscription through checkout, but does not document whether checkout requires a payment method for every account. Verify this in the deployment account before provisioning the required bucket.
- Supabase's pricing and billing pages list a $0 Free plan and two active projects. Those public pages do not establish a universal credit-card/payment-method rule for every signup or account. Verify the actual Cloudflare and Supabase account flows before deployment rather than promising that no payment method will be requested.
- Workers AI's pricing page lists 10,000 Neurons/day at no charge; use above that requires Workers Paid. Some named frontier models require a paid billing method. `@cf/meta/llama-3.2-1b-instruct` has a current model documentation page and is not among the paid-method-only exceptions listed on the pricing page. The Llama 3.1 8B Fast model documentation URL returned 404 on this verification date, although its identifier remains in the pricing table; do not rely on it without a successful account/model-catalog check.
- Supabase Free is a viable no-cost pilot option within its limits, but it does not satisfy a requirement for guaranteed continuous availability or downloadable provider-managed backups: projects with low activity may be paused after seven days, and Free projects have no downloadable database backups. If either capability is required for production, a paid plan or a different architecture is needed.
- All provider details above were checked on 2026-10-16. A free plan is not a guarantee that an account will never be asked for payment information, or that the service will remain available or free indefinitely.

## Privacy and governance constraints

### Cloudflare privacy and terms

Cloudflare is a managed hosting and edge platform. The design should not assume that it is a decentralized or self-hosted provider. The architecture remains dependent on Cloudflare’s operational continuity, model availability, account policy, and terms.

The docs emphasize plan-based quotas and behavior changes for free tiers; they do not promise perpetual free operation. This makes the design requirement explicit: the deployment architecture must be able to degrade gracefully when quotas are exhausted, and it must avoid assumptions that provider services will remain free indefinitely.

### Supabase privacy and availability

Supabase is a managed Postgres/Auth/Storage platform. Its docs also note operational caveats, including:

- project pause on inactivity for Free plan
- no free-plan downloads for database backups
- no guarantee that free tiers remain unchanged over time

These are not edge conditions; they are part of the current free-plan operating model and should be treated as deployment requirements, not just documentation footnotes.

## Design implications for this project

1. Free-tier verification must be repeated before rollout.
   - Quotas and model availability are not static and should be checked immediately before implementation or deployment.

2. Free operation is a deployment target, not a guarantee.
   - The architecture must degrade gracefully when quotas are reached or a provider changes billing or terms.

3. Provider dependence is real.
   - Cloudflare and Supabase are trusted operators. The system is not provider-independent or fully decentralized by design.

4. AI must be isolated and bounded.
   - Workers AI usage is billable by token usage, and model availability is not permanent. The architecture must not silently fall back to paid AI or assume availability of a specific model.

5. Production-grade policy should be explicit.
   - Free-tier pauses, inactivity rules, backups, and quotas must be accounted for in the deployment and operational plan.

## Source list

- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Pages pricing: https://developers.cloudflare.com/pages/platform/pricing/
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare R2 getting started: https://developers.cloudflare.com/r2/get-started/
- Cloudflare R2 bucket creation: https://developers.cloudflare.com/r2/buckets/create-buckets/
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Cloudflare Workers AI models: https://developers.cloudflare.com/workers-ai/models/
- Cloudflare Llama 3.2 1B model documentation: https://developers.cloudflare.com/workers-ai/models/llama-3.2-1b-instruct/
- Supabase pricing: https://supabase.com/pricing
- Supabase billing: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase production guidance: https://supabase.com/docs/guides/platform/going-into-prod

## Recommendation

Before implementation proceeds with production-like AI or paid integrations, confirm the current quotas and pricing for the exact Cloudflare and Supabase accounts that will be used, including whether billing is required for the target account and which AI models remain available in the active model catalog. The current documentation supports the design requirement that the system must avoid assumptions of perpetual free operation or provider-independent decentralization.

## Capacity estimate for the planned CommunityMesh workload

There is no running application or production telemetry in this repository, so an exact maximum user count cannot yet be measured. The estimates below use published free-plan ceilings and transparent scenarios. They are planning bounds, not a load-test result or a service guarantee.

### Recommended free-tier launch size and activity

For an initial real-world pilot, use a conservative operating target of **100–500 monthly active users (MAU), with about 25–100 daily active users (DAU)**. This is a recommended starting envelope, not a provider-imposed limit. It keeps the expected Worker traffic well below the 100,000-request/day hard cap while the team measures actual image delivery, sync behavior, database growth, and event write amplification.

Suggested pilot budget:

| Measure | Recommended target | How to interpret it |
| --- | ---: | --- |
| Monthly active users | 100–500 MAU | Keep well below Supabase Free's 50,000 MAU cap while validating real storage, auth, and egress use. |
| Daily active users | 25–100 DAU | Pilot activity level; actual MAU/DAU ratio depends on community usage. |
| Worker API requests | Average 20–40 per DAU/day; 4,000 requests/day target ceiling | At 100 DAU and 40 requests each, that is 4,000 requests/day (4% of Workers Free's 100,000/day). Include search, sync, retries, and image authorization in this count. |
| Durable D1 business events | Aim for no more than 1,000/day during the pilot | This is a conservative operational budget, not a D1 quota. Track actual D1 rows written per event; at four counted row writes/event, 1,000 events use about 4,000 of 100,000 daily free writes (4%). |
| AI inference | Start with at most 100 small-model calls/day, shared across agents | This leaves room to learn actual Neurons per call and keeps AI a small part of the 10,000-Neuron daily budget. For the example 500-input/150-output-token Llama 3.2 1B request (~4 Neurons), 100 calls use about 400 Neurons/day. Set a hard account-wide cap and disable/defer AI when reached. |
| Images | Resize/compress uploads; start with a 250 KB average target and monitor totals | At that average, 1 GB stores about 4,000 images before overhead. Restrict upload size and count, and avoid assuming repeated downloads fit in 5 GB monthly egress. |
| Headroom | Keep normal usage below 70% of every measured quota | Investigate at 70%, decide on upgrade or reduction by 80%, and degrade nonessential features by 90%; these are recommended internal thresholds, not provider limits. |

**Recommended starting point:** begin around **100–250 MAU and 25–50 DAU**, then raise the pilot cap toward 500 MAU / 100 DAU only after at least several weeks of observed quota, storage, and egress data. The initial limit is intentionally conservative because Supabase's 1 GB image storage and 5 GB egress can be reached much sooner than its 50,000 MAU cap, and no production measurements exist yet.

For usage planning, a “daily active user” should mean a distinct authenticated member who makes at least one meaningful app request that day; exclude static Pages assets, health probes, and scheduled jobs from this product metric, but do include all inbound requests that count against Workers quota in the provider-metered total. Define “business event” separately from API request: a single user action can trigger several API requests and several D1 row writes.

### Activity-based user categories and request budgets

The following model ties the estimate to likely CommunityMesh activities. Counts are **Worker API requests per active day**, not clicks or database rows. They are planning assumptions based on the proposed API boundaries; the implementation may combine or split endpoints. Browser shell assets served by Pages are not included. The counts include login/session checks, search, listing detail, sync, and mutations.

| Activity | Worker requests assumed | Durable-store impact under the planned ownership |
| --- | ---: | --- |
| Sign in | 1 | Supabase Auth; no routine D1 write |
| Load/validate session and own profile | 1 | Supabase Auth/profile read; no routine D1 write |
| Search one result page | 1 | Supabase query; no routine D1 write |
| Open one listing detail | 1 | Supabase read; no routine D1 write |
| Sync one foreground cycle | 2 | Worker sync/download and submit/acknowledge; reads/writes are split across Supabase and D1 by store; changes do not automatically mean one new D1 row |
| Create a listing with one image | 3 | Listing and image metadata in Supabase; image upload uses short-lived authorized storage access. Image bytes consume Supabase storage/egress, not three Worker calls per image chunk |
| Submit task evidence | 1 | Task/evidence in Supabase; D1 credit rows are written only after approval/reward processing |
| Cast a governance vote | 1 | Private ballot in D1; count actual ballot and index row writes using D1 metrics |
| Approved task reward / ledger award | Usually no extra member request beyond review/approval flow | Cross-store reward processing writes multiple D1 rows (plan for 3–4 rows per award until measured) |

Business-user profiles:

| Business user category | Example activity on an active day | Estimated Worker requests/day | Typical active days/month | Approx. requests/month per active user |
| --- | --- | ---: | ---: | ---: |
| **Neighbor / browser** | Sign in + session/profile (2); 4 search pages; open 6 listing details; 1 sync cycle (2) | 14 | 13 (about 3 days/week) | 182 |
| **Member / listing contributor** | Sign in + session/profile (2); 5 searches; open 8 details; 1 sync cycle (2); create/edit one listing with one image (3); submit one task/profile mutation (2) | 22 | 17 (about 4 days/week) | 374 |
| **Community organizer / moderator** | Sign in + session/profile (2); 6 searches; open 10 details; 2 sync cycles (4); create/edit two listings (6); perform 8 moderation, task-review, or governance actions; inspect usage/queue (2) | 38 | 22 (about 5 days/week) | 836 |

These categories describe representative activity, not role permissions or hard per-user quotas. An organizer's eight review/governance actions are eight Worker calls in this estimate; a bulk UI or batched endpoint could reduce them. Conversely, retries, pagination, repeated sign-ins, polling, and validation calls can raise request counts. Listing images can dominate storage and egress even though upload bytes are not counted as Worker API requests.

At the **80,000 requests/day planning budget** (20% headroom preserved), a population made entirely of one category would reach the request budget at approximately:

| All active users in this category | Approx. DAU at 80,000 requests/day | Approx. DAU at the 100,000/day hard cap |
| --- | ---: | ---: |
| Neighbor / browser (14 requests/day) | 5,714 | 7,143 |
| Member / listing contributor (22 requests/day) | 3,636 | 4,545 |
| Community organizer / moderator (38 requests/day) | 2,105 | 2,632 |

Use a **weighted average** for a mixed population, not the sum of the category maxima. Example: if a daily active population is 70% browsers, 25% contributors, and 5% organizers, the estimated average is `0.70 × 14 + 0.25 × 22 + 0.05 × 38 = 17.2` requests/DAU/day. At 80,000 requests/day, the arithmetic ceiling is about **4,651 DAU** for that mix, before storage, egress, CPU, burst, and operational constraints. Apply headroom and set a lower operating target.

The suggested pilot of **25–50 DAU** produces approximately **350–1,900 Worker requests/day** across these profiles (25 organizers at 38 requests = 950; 50 organizers = 1,900), or about **0.35%–1.9%** of the 100,000-request hard cap. It remains a reasonable conservative launch range, but image storage/egress and Supabase pause/backup behavior still need separate monitoring.

### Business events versus API requests

User activities do not map one-to-one to D1 events. Supabase owns Auth, profiles, listings, tasks, and image metadata in this design; routine login, listing search/detail, listing creation, and task evidence therefore do not each create a D1 row. D1 owns governance, policy, credits/ledger, and AI run logs. Budget those separately:

| D1-backed business event | Approximate D1 rows written for planning | Count as |
| --- | ---: | --- |
| Governance ballot | 1 ballot row plus any counted index rows; measure with D1 `meta.rows_written` | A governance event, not a generic listing/API event |
| Approved contribution reward | 3–4 rows initially (ledger entry, balance update, and any related/milestone records); validate actual transaction and indexes | A reward event, only after approval |
| AI agent run log | At least 1 run record, plus any separately persisted result/affected-record rows | A scheduled AI event, even if no member is online |
| Listing search/detail | 0 routine D1 writes under current store ownership | API reads against Supabase, plus one Worker request per page/detail |

For example, **1,000 approved reward events/day × 4 D1 rows/event = 4,000 D1 rows written/day**, or 4% of the 100,000 daily free allowance. If the app instead has 10,000 unindexed reads that each scan 500 D1 rows, those reads alone use the 5-million-row daily read allowance. Optimize indexes and inspect D1 metrics; do not estimate D1 activity by counting buttons or users alone.

### Practical user ceiling

The highest published user-count quota is Supabase's 50,000 monthly active users (MAU), but that is not the effective capacity limit for this design. Cloudflare Workers' daily request cap is likely to bind first for active usage. Supabase egress, database size, and image storage can bind earlier still, depending on how much content each member views or creates.

For a planning estimate, reserve 20% of the Workers Free daily request allowance for scheduled work, retries, admin activity, health checks, and unexpected bursts. That leaves approximately 80,000 member-facing/API requests per day.

| Average API requests per daily active user | Approximate DAU before using the 80,000-request planning budget | Theoretical DAU at the full 100,000-request limit |
| ---: | ---: | ---: |
| 20 | 4,000 | 5,000 |
| 50 | 1,600 | 2,000 |
| 100 | 800 | 1,000 |

This calculation is `daily request budget / API requests per DAU`. Count each browser-to-Worker request, including sync polling, pagination, search, retries, and image authorization. Batch sync and pagination can materially reduce the count. DAU does not convert directly to MAU: 4,000 recurring DAU could represent only 4,000 MAU, while 4,000 DAU made up of new or infrequent users could be part of a much larger MAU population. For example, 50,000 MAU with 4,000 DAU at 20 requests/DAU/day would consume about 80,000 requests/day; if all 50,000 were active daily at 20 requests each, that would be 1,000,000 requests/day and exceed Workers Free by 10x. Measure the DAU/MAU ratio and requests per active user.

**Current planning answer:** allow roughly 800–4,000 DAU under the 20% headroom budget for 100–20 Worker API requests per DAU, subject to Supabase's 50,000 MAU and data/egress limits. Do not advertise a guaranteed user capacity until a representative workload has been measured.

### Storage and data-transfer constraints

Supabase Free also includes 500 MB database, 1 GB file storage, and 5 GB egress. Simple division gives rough ceilings before accounting for system overhead, indexes, metadata, shared listing data, and cached transfer:

| Resource | Example assumption | Approximate count using the entire free quota |
| --- | --- | ---: |
| Database | 10 KB of database data per member | ~50,000 members |
| Database | 50 KB of database data per member | ~10,000 members |
| Database | 100 KB of database data per member | ~5,000 members |
| Image storage | 250 KB average stored image | ~4,000 images |
| Image storage | 1 MB average stored image | ~1,000 images |
| Egress | 100 KB downloaded per MAU/month | ~50,000 MAU, capped by the MAU quota |
| Egress | 1 MB downloaded per MAU/month | ~5,000 MAU |
| Egress | 5 MB downloaded per MAU/month | ~1,000 MAU |

These are deliberately simple upper-bound divisions. In practice reserve capacity for profiles, indexes, thumbnails, retries, multiple image views, and other users' content. Images are particularly likely to make egress or storage the earliest Supabase limit.

### D1 event and ledger-write estimates

D1 Free includes 100,000 rows written/day, 5 million rows read/day, and 5 GB total storage across the account. D1 bills/limits based on rows touched, not only rows returned. Index updates can add counted writes. A single conceptual event may therefore consume multiple row writes (for example, a ledger entry, balance update, and related audit/index writes).

| D1 rows written per conceptual event | Theoretical events/day at 100,000 rows | Events/day with 20% headroom (80,000 rows) |
| ---: | ---: | ---: |
| 1 | 100,000 | 80,000 |
| 2 | 50,000 | 40,000 |
| 4 | 25,000 | 20,000 |

For reads, 5 million rows/day divided by 50 rows scanned per API action is 100,000 such actions/day; at 100 rows scanned per action it is 50,000. The app's Worker request ceiling, rather than D1 reads, will often bind first, but unindexed ballot, ledger, or activity queries can reverse that. Use D1 query `meta.rows_read` and `meta.rows_written` to replace these assumptions with observed counts. Indexes and query plans should be tested against representative data.

The word “event” needs a product definition. A listing view, profile update, approved task, credit ledger entry, proposal vote, and AI run have different row and request costs. For operations, report both API request counts and durable business-event counts instead of one ambiguous event total.

### Other free-tier ceilings that may matter

- Workers Free: 100,000 requests/day; exceeding this returns an error (currently documented as Error 1027). The 10 ms CPU ceiling and 50 subrequest/request limit can constrain individual endpoints before the daily cap.
- Pages Free: 500 builds/month, or roughly 16 builds/day averaged over a month; exceeding deployment capacity is independent of user count.
- Workers AI Free: 10,000 Neurons/day across the account, reset at 00:00 UTC. For the listed Llama 3.2 1B model, a rough request with 500 input tokens and 150 output tokens uses about 4 Neurons, yielding about 2,500 such requests/day theoretically. At 20% headroom (8,000 Neurons), plan for about 2,000. Actual use varies by model and token counts. Some models require a paid billing method; exceeding the free daily allocation on Workers Free fails until reset, while Workers Paid enables metered overage.
- Supabase Free: 50,000 MAU; 500 MB DB/project; 1 GB storage; 5 GB egress; 2 million Realtime messages and 200 peak Realtime connections. The Realtime quotas only matter if the app adopts Supabase Realtime; the current architecture's cursor-based API sync does not require it.
- Supabase Free projects may pause after 7 days of inactivity, and downloadable DB backups are unavailable on Free. These are operational reasons to choose paid service even before usage quotas are exhausted if continuous availability/recovery is required.

### When to upgrade or degrade

The hard transition points are provider limits, not a single common user count:

| Service | Free-tier boundary | Required action |
| --- | --- | --- |
| Workers | More than 100,000 requests/day, or endpoints that cannot fit the 10 ms CPU limit | Upgrade to Workers Paid before the expected breach, or rate-limit/degrade nonessential endpoints. Workers Paid currently starts at $5/month/account and includes 10 million requests/month; further usage is metered. Free-plan traffic can fail at the cap. |
| D1 | More than 5 million rows read/day, 100,000 rows written/day, or 5 GB stored | Upgrade to Workers Paid for metered usage, or reduce queries/data; read/write exhaustion blocks queries on Free. Paid currently includes 25 billion rows read/month, 50 million rows written/month, and 5 GB storage, then published per-million/GB rates apply. |
| Workers AI | More than 10,000 Neurons/day, or use of a paid-method-only model | Use Workers Paid and budget for metered inference, or disable/defer AI. Neurons above the daily free allowance currently cost $0.011 per 1,000. Never silently invoke a paid model. |
| Supabase | More than 50,000 MAU, 500 MB DB/project, 1 GB storage, or 5 GB egress | Upgrade the organization/project to a paid plan, reduce/expire data, or move the affected workload. Supabase Pro currently starts at $25/month; check the project's compute and usage charges before upgrading. |
| Supabase availability/recovery | Need to prevent inactivity pause or need downloadable managed backups | Use an appropriate paid plan or arrange and test independent backups before production. |
| Pages | More than 500 builds/month, >20,000 site files, or other free asset limits | Reduce build churn/assets or move to the plan that supports the requirement. |

Recommended internal thresholds (not provider limits): alert at 70% of a quota, start a paid-plan or workload-reduction decision at 80%, and apply controlled degradation by 90%. Do not wait for 100%, because quotas are shared by the account and usage is bursty. On free plans, “upgrade” may mean activating a paid plan with billing details; verify the exact account's billing setup before the threshold is reached. Supabase's Free plan can be started at $0, while paid organizations have a subscription and usage-billing model.

## Provider-usage dashboard in the CommunityMesh UI

Yes. The planned application can include a restricted **Deployment Operations → Usage** dashboard. Access should use a deployment-operator role separate from community-scoped Admin roles, because provider metrics are account-wide. This repository is currently a greenfield OpenSpec plan with no running UI or telemetry, so this is an implementation design rather than an existing feature.

Recommended dashboard cards:

- Cloudflare Workers: requests/day, error rate, CPU-time distribution, subrequests, and free-plan quota remaining.
- D1: rows read/written today, storage, and per-database usage.
- Workers AI: Neurons used today and by model/agent, remaining daily allocation, failed quota-exhausted runs, and estimated paid usage if Workers Paid is enabled.
- Supabase: MAU, database size, file-storage size, egress, and Realtime messages/connections if used.
- Pages: builds this month, concurrent builds, and asset/file counts.
- Operational status: last metric refresh, source/provider, whether each metric is live, delayed, estimated, or unavailable; AI and sync degraded-mode state.

Implementation constraints:

1. Fetch Cloudflare and Supabase usage through server-side provider APIs or provider analytics exports, using least-privilege credentials stored only as Worker secrets. Never expose provider tokens or account-wide metrics to browser code.
2. The Workers AI docs explicitly provide a Cloudflare dashboard for Neuron usage; D1 documents its database dashboard, `meta` usage, and GraphQL Analytics API. Supabase exposes usage through its dashboard and management/billing surfaces. Confirm which API metrics are available to the chosen account and plan before promising automated coverage.
3. Persist only aggregate, time-bucketed usage snapshots in D1 (or another operator-controlled store); do not copy provider logs, member identifiers, ballot data, or private profile fields into a public view. Restrict the dashboard to authorized platform operators/Admins.
4. Show source timestamp and freshness prominently. If a provider metric cannot be retrieved, show “unavailable/stale” rather than a success-shaped zero. Provide direct links to provider consoles as the fallback.
5. Set configurable alerts at 70%, 80%, and 90%; keep the dashboard's own polling low-frequency so monitoring does not materially consume quotas.
6. Provider console dashboards remain the source of truth for invoices and official billing. A CommunityMesh dashboard would be an operational estimate, not a billing guarantee.

The separate public AI activity feed should continue to show agent run status and safe outcome summaries only; it must not expose capacity/billing account data or private provider metrics.
