# Design

## Context

See proposal.md for motivation. The repository contains no application source, database schema, or capability specs, so this is a greenfield architecture. The requested deployment is provider-hosted: Cloudflare and Supabase remain trusted operators and potential availability or policy dependencies. Their current free-tier quotas, payment-method requirements, model catalog, and terms must be checked before implementation; free operation is a deployment target, not a perpetual availability guarantee.

The behavior contracts are in `specs/community-listings/spec.md`, `specs/community-identity/spec.md`, `specs/dao-governance/spec.md`, `specs/contribution-system/spec.md`, `specs/ai-operations/spec.md`, and `specs/community-experience/spec.md`.

## Goals / Non-Goals

**Goals:**
- Keep privileged service credentials and application data access behind Cloudflare Workers.
- Give each data store a clear owner and make cross-store effects retry-safe and auditable.
- Keep AI actions bounded, observable, and reversible by human review.
- Make the initial deployment operable within verified free-tier limits, with graceful degradation when quotas are exhausted.

**Non-Goals:**
- Blockchain consensus, public token trading, token-weighted voting, or guaranteed resistance to a Cloudflare or Supabase outage.
- Autonomous permanent moderation, autonomous governance execution outside an allowlisted action handler, or autonomous changes to production policy.
- Guaranteeing that provider free tiers, AI models, or account policies remain unchanged over time.

## Decisions

### Application and API boundaries

- Build a React/Vite single-page application with Tailwind CSS and deploy its static assets on Cloudflare Pages. Use explicit routes for home, local hub, listing search/detail/create, profile, contributor tasks, governance, and AI activity. Keep shared navigation, route-level views, and feature-specific components separate; the implementation task breakdown will define the component tree.
- Send application data and authentication requests through a versioned Cloudflare Worker API. The browser never receives Supabase service-role credentials and does not write directly to Postgres, D1, or storage. The Worker validates Supabase access tokens and authorization for every protected request. Authentication endpoints may proxy Supabase Auth; image upload uses Worker-authorized, short-lived upload access.
- Keep API handlers separated by domain (identity, listings, tasks/credits, governance, and AI operations) while deploying the smallest practical Worker surface initially. This keeps authorization and environment bindings consistent without creating a Worker per endpoint.

**Alternative considered:** Direct browser access to Supabase would simplify some CRUD, but it conflicts with the all-API-through-Workers boundary and creates a second authorization path. It is not selected.

### Data ownership and storage

- Supabase Auth owns authentication identities. Supabase Postgres owns member profile fields, community membership, listings, image metadata, task records, and a task-completion outbox. Supabase Storage owns listing images. Listing search uses Postgres full-text search scoped by a stable community identifier and category; the first version uses ZIP/city labels rather than exposing precise member coordinates.
- Cloudflare D1 owns DAO proposals, private vote records, governance execution history, the CC/WC/DT append-only ledger and balances, and AI run logs. Cross-database references use stable opaque user, task, and listing identifiers; there are no assumed cross-database foreign keys.
- Keep the user-facing task lifecycle in Supabase as requested and the credit source of truth in D1. On approved task completion, a Postgres transaction marks the task complete and enqueues a uniquely keyed outbox event. A Worker applies the associated D1 credit entry using a unique source-event key, then marks the outbox event delivered. A scheduled reconciler retries undelivered events. D1's uniqueness constraint prevents duplicate awards if delivery or acknowledgment is retried.
- Treat DAO Tokens as internal ledger units with no transfer, redemption, or monetary promise. They do not affect voting power. Credit award rules and amounts are published, versioned configuration; a ledger adjustment creates a compensating entry rather than editing history.

**Alternative considered:** Keeping task state and credits in one database would simplify transactions, but would contradict the requested Supabase task / D1 credit ownership. The outbox plus idempotent consumer is selected to make that boundary recoverable without claiming a distributed transaction.

### Identity, community scope, and governance

- Use an authenticated account as the unit for the one-member-one-vote invariant. Snapshot the eligible account IDs and the active quorum/approval rule values when a proposal opens; enforce a unique `(proposal_id, member_id)` vote and calculate outcomes from that immutable electorate and rule snapshot. Document that account-level uniqueness does not prove one natural person has only one account.
- Store individual ballots privately in D1 and publish aggregate counts and outcomes. Quorum is measured against the snapshotted eligible electorate; the configured approval threshold is measured against non-abstaining votes. Governance configuration must reject invalid thresholds. A passed proposal can execute only through a registered, idempotent action handler; unsupported or unsafe payloads are recorded for human or operational follow-up rather than interpreted as arbitrary code.
- A local hub is a stable community record selected by a supported ZIP or city. Membership and eligible voting status are scoped to that record. Exact location verification is not assumed for the first release; anti-abuse controls and jurisdictional membership verification can be added only through an explicit policy change.

**Alternative considered:** Token-weighted voting would couple governance power to the credit/token economy and make issuance policy a security-critical voting rule. It is not selected; one account in a community has at most one vote.

### AI agent execution and safety

- Implement the five named agents as shared Worker code paths with distinct schedules, permissions, input limits, and idempotency keys: `ai_moderator`, `ai_curator`, `ai_task_dispatcher`, `ai_summarizer`, and `ai_maintenance`. Scheduled handlers use Cloudflare Cron Triggers and write structured D1 run records, including status, model identifier, time, and affected record identifiers. Do not put private profile fields or unnecessary raw content in public logs.
- Configure model identifiers per agent through deployment configuration, validate them against the current Cloudflare AI catalog before rollout, and keep a fallback or disabled state when a model is unavailable. The requested Llama 3.1 variants are candidates, not hard-coded assumptions: availability, context limits, quotas, and free-tier eligibility must be verified. In particular, do not depend on a 70B model or claim it is free unless verified for the target account.
- The moderator can place a short-lived hold only above a configured high-confidence threshold. Human reviewers release or uphold it; no AI action permanently deletes content or sanctions an account. Curator and summarizer outputs remain advisory and link to source content. The dispatcher deduplicates tasks by source finding. Maintenance produces diagnostics or review tasks but cannot mutate rules, permissions, or deployment configuration.
- Define per-run time, batch, and inference limits. On quota exhaustion, model failure, or timeout, persist a failed/degraded run and leave content or policy unchanged; do not silently fall through to paid services.

**Alternative considered:** A single autonomous agent with broad write access could reduce orchestration code but would make mistakes and prompt injection high-impact. Narrow per-agent permissions and human review are selected.

### Free-tier and operational constraints

- Before implementation, verify that Cloudflare Pages, Workers, D1, Workers AI, Supabase Auth, Postgres, and Storage can be provisioned for the intended test and production usage without a required payment method. Record the dated quota and model checks in deployment documentation. If the constraint fails for a required capability, stop and present a decision rather than silently selecting a paid fallback or weakening a requirement.
- Keep resource budgets configurable and observable: cap listing-image size, search result size, agent batch size, schedule frequency, and log retention. Surface degraded operation to maintainers and preserve manual listing, voting, and task workflows if AI limits are reached.
- Keep secrets in Worker environment secrets; apply least privilege to Supabase service credentials and restrict CORS to deployed application origins. Validate request schemas, enforce ownership and role checks at the Worker boundary, rate-limit public and mutation routes, and avoid logging access tokens or private profile values.

## Risks / Trade-offs

- [Provider quotas or account policy change] → Recheck no-payment requirements and quotas before deployment; use explicit budgets and fail closed from paid fallback behavior.
- [Cloudflare AI model is unavailable, changes, or exceeds free quota] → Configure model IDs per agent, validate before rollout, preserve non-AI workflows, and log degraded runs.
- [Supabase-to-D1 completion delivery is delayed or retried] → Use a transactional Postgres outbox, unique D1 source-event keys, and scheduled reconciliation; expose pending award state until delivered.
- [One account per vote does not guarantee one human per vote] → State the account-based rule publicly, apply account abuse controls, and leave identity verification as a future governance decision rather than implying Sybil resistance.
- [AI moderation creates false positives or misses harmful content] → Use temporary holds only, thresholded classification, human review, appeal, and an auditable outcome trail.
- [Two managed providers create operational dependency and lock-in] → Keep Worker API contracts and SQL migrations explicit, document exports/backups and recovery, and describe the result as community-governed hosted infrastructure rather than fully decentralized.
- [Public AI activity leaks sensitive content] → Store minimal structured outcomes, exclude private profile data, and keep raw prompts/responses out of public views by default.
- [Free-tier services cannot meet production demand] → Treat initial rollout as quota-bounded; implement pagination, limits, retention, and graceful degradation, and require a separate decision before any paid upgrade.

## Migration Plan

This is a greenfield deployment; there is no existing production data to migrate. Create versioned Supabase and D1 schema migrations, configure secrets and bindings for a non-production environment, and deploy the Worker API and Pages application before enabling scheduled agents. Validate Auth, ownership checks, listing search, task completion/outbox reconciliation, governance snapshots and execution idempotency, and AI hold/review flows with test data. Verify free-tier/account constraints before production setup, then enable agent schedules with conservative limits. Roll back by disabling Cron Triggers and routing traffic away from the new Pages/Worker deployment; preserve database records and use forward migrations or documented exports rather than destructive schema rollback.

## Open Questions

- Which ZIP/city areas should be enabled for the initial community directory? The first deployment can use an explicit configuration list without changing the architecture or behavior contracts.
- What initial quorum, approval thresholds, task award amounts, and agent schedules should be configured? These are versioned operational values and must be reviewed before production launch; the specs require them to be published and snapshotted, not particular numbers.