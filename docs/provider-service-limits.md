# Provider service limits and deployment constraints

Last verified: 2026-10-16

This note records the current, provider-published limits and conditions for the deployment architecture described in the OpenSpec design. It is a design-time verification artifact, not a guarantee that these limits will remain available forever or that the system can remain free/fully decentralized across providers.

## Executive summary

- Cloudflare Workers Free is a real free tier, but it is limited to 100,000 requests/day, 10 ms CPU time per request, 128 MB memory, and low daily quotas for related services. It is not a perpetual no-cost operating model and is subject to provider policy changes.
- Cloudflare Pages Free is available but limited to 500 builds/month and 20,000 files/site; function traffic counts against Workers quotas.
- Cloudflare D1 Free includes 5 million rows read/day, 100,000 rows written/day, and 5 GB storage. Usage over these limits is billed, and free quotas are daily account limits.
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

- Supabase offers Free, Pro, Team, and Enterprise plans.
- Supabase Free requires no payment to start, but the platform clearly documents inactivity pauses and hard limits.
- Paid plans add higher quotas and more production-grade operational features, including backups, higher storage, and higher limits.
- The design should assume that a production or higher-traffic launch may require a paid plan or billing arrangement, even if the initial pilot is within free limits.

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
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Cloudflare Workers AI models: https://developers.cloudflare.com/workers-ai/models/
- Supabase pricing: https://supabase.com/pricing
- Supabase billing: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase production guidance: https://supabase.com/docs/guides/platform/going-into-prod

## Recommendation

Before implementation proceeds with production-like AI or paid integrations, confirm the current quotas and pricing for the exact Cloudflare and Supabase accounts that will be used, including whether billing is required for the target account and which AI models remain available in the active model catalog. The current documentation supports the design requirement that the system must avoid assumptions of perpetual free operation or provider-independent decentralization.

## Capacity estimate for the planned CommunityMesh workload

There is no running application or production telemetry in this repository, so an exact maximum user count cannot yet be measured. The estimates below use published free-plan ceilings and transparent scenarios. They are planning bounds, not a load-test result or a service guarantee.

### Practical user ceiling

The highest published user-count quota is Supabase's 50,000 monthly active users (MAU), but that is not the effective capacity limit for this design. Cloudflare Workers' daily request cap is likely to bind first for active usage. Supabase egress, database size, and image storage can bind earlier still, depending on how much content each member views or creates.

For a planning estimate, reserve 20% of the Workers Free daily request allowance for scheduled work, retries, admin activity, health checks, and unexpected bursts. That leaves approximately 80,000 member-facing/API requests per day.

| Average API requests per daily active user | Approximate DAU before using the 80,000-request planning budget | Theoretical DAU at the full 100,000-request limit |
| ---: | ---: | ---: |
| 20 | 4,000 | 5,000 |
| 50 | 1,600 | 2,000 |
| 100 | 800 | 1,000 |

This calculation is `daily request budget / API requests per DAU`. Count each browser-to-Worker request, including sync polling, pagination, search, retries, and image authorization. Batch sync and pagination can materially reduce the count. At 20 requests/day and 30 active days/month, 4,000 DAU would imply about 120,000 monthly active accounts, so Supabase's 50,000 MAU cap would become the lower ceiling; at full daily activity that is at most 50,000 MAU. Real DAU is normally lower than MAU, and the relationship must be measured rather than assumed.

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
| Workers | More than 100,000 requests/day, or endpoints that cannot fit the 10 ms CPU limit | Upgrade to Workers Paid before the expected breach, or rate-limit/degrade nonessential endpoints. Free-plan traffic can fail at the cap. |
| D1 | More than 5 million rows read/day, 100,000 rows written/day, or 5 GB stored | Upgrade to Workers Paid for metered usage, or reduce queries/data; read/write exhaustion blocks queries on Free. |
| Workers AI | More than 10,000 Neurons/day, or use of a paid-method-only model | Use Workers Paid and budget for metered inference, or disable/defer AI. Never silently invoke a paid model. |
| Supabase | More than 50,000 MAU, 500 MB DB/project, 1 GB storage, or 5 GB egress | Upgrade the organization/project to a paid plan, reduce/expire data, or move the affected workload. |
| Supabase availability/recovery | Need to prevent inactivity pause or need downloadable managed backups | Use an appropriate paid plan or arrange and test independent backups before production. |
| Pages | More than 500 builds/month, >20,000 site files, or other free asset limits | Reduce build churn/assets or move to the plan that supports the requirement. |

Recommended internal thresholds (not provider limits): alert at 70% of a quota, start a paid-plan or workload-reduction decision at 80%, and apply controlled degradation by 90%. Do not wait for 100%, because quotas are shared by the account and usage is bursty. On free plans, “upgrade” may mean activating a paid plan with billing details; verify the exact account's billing setup before the threshold is reached. Supabase's Free plan can be started at $0, while paid organizations have a subscription and usage-billing model.

## Provider-usage dashboard in the CommunityMesh UI

Yes. The planned application can include a restricted **Admin → Operations → Usage** dashboard. This repository is currently a greenfield OpenSpec plan with no running UI or telemetry, so this is an implementation design rather than an existing feature.

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
