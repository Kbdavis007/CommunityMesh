# Provider service limits and deployment constraints

Last verified: 2026-10-16

This note records the current, provider-published limits and conditions for the deployment architecture described in the OpenSpec design. It is a design-time verification artifact, not a guarantee that these limits will remain available forever or that the system can remain free/fully decentralized across providers.

## Executive summary

- Cloudflare Workers Free is a real free tier, but it is limited to 100,000 requests/day, 10 ms CPU time per request, 128 MB memory, and low daily quotas for related services. It is not a perpetual no-cost operating model and is subject to provider policy changes.
- Cloudflare Pages Free is available but limited to 500 builds/month and 20,000 files/site; function traffic counts against Workers quotas.
- Cloudflare D1 Free includes 5 million rows read/day, 100,000 rows written/day, and 5 GB storage. Usage over these limits is billed, and free quotas are daily account limits.
- Workers AI currently has explicit token-based pricing and no advertised free tier. This means AI is not a free fallback by default; model availability and price points vary by model and can change.
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
- Once daily thresholds are exceeded, the account is billed according to pricing metrics; this is not a zero-cost guarantee at scale.

### Cloudflare Workers AI

Provider docs: https://developers.cloudflare.com/workers-ai/platform/pricing/ and https://developers.cloudflare.com/workers-ai/models/

Current pricing and availability status:

- Workers AI pricing is listed as token-based rates (for example, $0.027 per M input tokens for some small models, with output prices in the same pricing table).
- The page shows a large model catalog with per-model input/output token prices, but it does not advertise a recurring free AI allotment.
- Model availability can change; the model catalog is maintained by Cloudflare and is not guaranteed to remain stable across time or account tiers.
- The design must treat AI as provider-dependent and quota-limited, not as a guaranteed perpetual free service.

Important operational notes:

- There is no free-tier token allowance documented on the pricing page at the time of verification.
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
