# Design

## Context

See proposal.md for motivation. The repository contains no application source, database schema, or capability specs, so this is a greenfield architecture. The requested deployment is provider-hosted: Cloudflare and Supabase remain trusted operators and potential availability or policy dependencies. Their current free-tier quotas, payment-method requirements, model catalog, and terms must be checked before implementation; free operation is a deployment target, not a perpetual availability guarantee.

The behavior contracts are in `specs/community-listings/spec.md`, `specs/community-identity/spec.md`, `specs/dao-governance/spec.md`, `specs/contribution-system/spec.md`, `specs/ai-operations/spec.md`, `specs/offline-sync/spec.md`, and `specs/community-experience/spec.md`.

## Goals / Non-Goals

**Goals:**
- Keep privileged service credentials and application data access behind Cloudflare Workers.
- Give each data store a clear owner and make cross-store effects retry-safe and auditable.
- Keep the application usable with previously synchronized data during intermittent connectivity, without treating an unconfirmed local write as server truth.
- Keep AI actions bounded, observable, and reversible by human review.
- Make the initial deployment operable within verified free-tier limits, with graceful degradation when quotas are exhausted.

**Non-Goals:**
- Blockchain consensus, public token trading, transferable Voting Tokens, or guaranteed resistance to a Cloudflare or Supabase outage.
- Offline task claims and governance votes, real-time synchronization guarantees, or complete offline copies of all account data.
- Autonomous permanent moderation, autonomous governance execution outside an allowlisted action handler, or autonomous changes to production policy.
- Guaranteeing that provider free tiers, AI models, or account policies remain unchanged over time.

## Decisions

### Application and API boundaries

- Build a React/Vite single-page application with Tailwind CSS and deploy its static assets on Cloudflare Pages. Use explicit routes for home, local hub, listing search/detail/create, profile, contributor tasks, governance, and AI activity. Keep shared navigation, route-level views, and feature-specific components separate; the implementation task breakdown will define the component tree.
- Send application data and authentication requests through a versioned Cloudflare Worker API. The browser never receives Supabase service-role credentials and does not write directly to Postgres, D1, or storage. The Worker validates Supabase access tokens and authorization for every protected request. Authentication endpoints may proxy Supabase Auth; image upload uses Worker-authorized, short-lived upload access.
- Keep API handlers separated by domain (identity, listings, tasks/credits, governance, and AI operations) while deploying the smallest practical Worker surface initially. This keeps authorization and environment bindings consistent without creating a Worker per endpoint.

**Alternative considered:** Direct browser access to Supabase would simplify some CRUD, but it conflicts with the all-API-through-Workers boundary and creates a second authorization path. It is not selected.

### PWA and offline synchronization

- Ship a web manifest and installable PWA. The service worker precaches versioned application-shell assets in Cache Storage and serves the shell for supported routes while offline. Do not use Cache Storage as the record database or cache authenticated API responses there.
- Use IndexedDB as the durable client record store. Feature repositories read from IndexedDB first and update the rendered view as synchronization applies remote changes. Store public records only for the selected community and the minimum profile/task data needed by the signed-in member. Keep authentication secrets and private ballots out of this store; partition private records and queued operations by account.
- Store supported local mutations in a durable outbox with a unique operation ID, account ID, entity ID, and base server revision. The initial offline write set is listing create/edit/archive, own-profile edits, and task-completion evidence. Task claims and governance votes require a live server response. Listing text may be drafted offline; image upload remains online-only in the first release.
- Expose authenticated Worker sync endpoints for idempotent outbox submission and incremental downloads. Use per-source monotonic cursors for Supabase and D1 changes, plus tombstones for deletions. Advance a device cursor only after the returned page is committed to IndexedDB. The server validates every operation and remains authoritative for accepted revisions, task claims, votes, credits, governance outcomes, and moderation decisions.
- Compare each mutation's base revision with the current server revision. Merge disjoint field updates; preserve both values for an overlapping field and return a conflict for member resolution. A resolution is submitted as a new idempotent operation against the latest server revision, never as an unconditional overwrite.
- Let the service worker request background synchronization where the browser supports it. Also trigger synchronization on application startup, foregrounding, and the browser's online event; background execution is best-effort, not a delivery guarantee. Keep queued changes until the server acknowledges them, and expose pending, conflict, and last-successful-sync state in the UI.
- Use same-origin secure, HttpOnly, SameSite session cookies for Worker requests so the service worker can make authenticated sync requests without storing bearer or refresh tokens in IndexedDB or Cache Storage. If the session expires, retain the account-scoped outbox and resume only after that account reauthenticates. On sign-out/account switch, require syncing or explicit discard of pending account changes before removing that account's private local cache.

**Alternative considered:** Browser `localStorage` is simpler but is synchronous, small, and lacks transactional writes suitable for a durable multi-record outbox. IndexedDB is selected for structured, transactional local state. Relying only on Background Sync would miss browsers that lack it or delay execution, so foreground retry is also required.

### Data ownership and storage

- Supabase Auth owns authentication identities. Supabase Postgres owns member profile fields, community membership, listings, image metadata, task records, and a task-completion outbox. Supabase Storage owns listing images. Listing search uses Postgres full-text search scoped by a stable community identifier and category; the first version uses ZIP/city labels rather than exposing precise member coordinates.
- Cloudflare D1 owns DAO proposals, private vote records, governance execution history, versioned community policy, the CC/WC/RT/VT append-only ledger and balances, and AI run logs. Cross-database references use stable opaque user, task, and listing identifiers; there are no assumed cross-database foreign keys.
- Keep the user-facing task lifecycle in Supabase as requested and the credit source of truth in D1. On approved task completion, a Postgres transaction marks the task complete and enqueues a uniquely keyed outbox event. A Worker applies the associated D1 credit entry using a unique source-event key, then marks the outbox event delivered. A scheduled reconciler retries undelivered events. D1's uniqueness constraint prevents duplicate awards if delivery or acknowledgment is retried.
- Store Reward Tokens (RT) and Voting Tokens (VT) in D1 as integer subunits at a documented, versioned ledger precision; never use floating-point amounts. Keep precision a storage-format concern while all economic amounts and ratios come from community policy. Contribution Credits and Work Credits remain separate, non-transferable measures.
- Store each community's active policy as an immutable version containing reward actions, reward types and amounts, eligibility, frequency limits, caps, RT-to-VT conversion, perk prices, and governance quorum/approval settings. Application logic MUST NOT supply economic or governance defaults. Seed the initial policy and Admin assignment from deployment configuration; later policy versions require community approval.
- Define a reward entry for every qualifying action in the active policy, keyed by a unique source event. Workers mint RT only when an active rule authorizes the event; task RT rewards are emitted only after review approval. Transfers and redemptions do not count as earned RT.
- Apply the active conversion policy to cumulative eligible RT earned in the community to grant VT without consuming RT. Track cumulative qualifying earnings separately from current RT balance so spending or transferring RT does not change the milestone total; transferred-in RT does not count. Do not embed a particular conversion ratio or reward amount in code.
- Apply RT mint, same-community RT transfer, in-app perk redemption, and VT milestone grants as idempotent D1 ledger events. Transfers atomically debit and credit equal amounts, preserving RT supply. Perk redemption debits/retire RT and records fulfillment. VT is non-transferable, cannot be redeemed or spent, and is used only as governance voting weight. Corrections use compensating entries rather than editing history.
- Implement these domain rules in the Worker and D1 ledger. Do not add a blockchain or web3 token package: the product has no external-chain or cryptographic-token behavior, and a package would not define the app-specific reward, transfer, milestone, or perk rules. Use integer accounting and test its invariants; do not hand-roll cryptography.

**Alternative considered:** One-member-one-vote avoids reward activity influencing governance, but conflicts with the requested Voting Token utility. Non-transferable VT earned from cumulative community RT activity is selected; proposal-open snapshots prevent mid-vote acquisition or transfer from changing a live tally. A blockchain or web3/NFT library would add an external chain, wallet, and transaction-cost dependency and is not selected.

### Admin and policy governance

- Define `community_admin` as a community-scoped authorization role. Bootstrap the initial Admin assignment through deployment configuration; subsequent assignment changes require community governance approval. The Worker checks community scope and Admin permission for every policy-proposal request.
- An Admin can draft a complete versioned policy containing token reward rules, eligibility/frequency limits, conversion ratio, perk prices, and governance thresholds. Submission creates a proposal but never changes the active policy. Members vote using the current VT snapshot and governance rules; a passed proposal atomically activates the new immutable version at its recorded effective time. Failed, pending, or invalid proposals leave the active version unchanged.
- Require explicit values for every configurable policy field in the deployment bootstrap and each proposed version; do not fall back to code constants. A policy proposal is evaluated under the governance rules active when voting opens, so it cannot change its own approval threshold.

**Alternative considered:** Letting Admins edit live policy directly is simpler but would bypass community governance and make reward or voting-power changes unilateral. Admin proposal authority with vote-gated activation is selected.

**Alternative considered:** Keeping task state and credits in one database would simplify transactions, but would contradict the requested Supabase task / D1 credit ownership. The outbox plus idempotent consumer is selected to make that boundary recoverable without claiming a distributed transaction.

### Identity, community scope, and governance

- Use an authenticated account as the unit that submits one ballot per proposal. Snapshot each eligible member's non-transferable VT balance, total eligible VT supply, and active quorum/approval rules when voting opens; enforce a unique `(proposal_id, member_id)` ballot and weight it by the snapshot. VT remains available for later proposals, but a balance earned after opening does not affect the current proposal. Document that account-level uniqueness does not prove one natural person has only one account.
- Store individual ballots privately in D1 and publish aggregate weighted counts and outcomes. Measure quorum against the snapshotted eligible VT supply and approval against non-abstaining ballot weight. Governance configuration must reject invalid thresholds. A passed proposal can execute only through a registered, idempotent action handler; unsupported or unsafe payloads are recorded for human or operational follow-up rather than interpreted as arbitrary code.
- A local hub is a stable community record selected by a supported ZIP or city. Membership and eligible voting status are scoped to that record. Exact location verification is not assumed for the first release; anti-abuse controls and jurisdictional membership verification can be added only through an explicit policy change.

**Alternative considered:** One-member-one-vote is simpler and keeps contribution rewards separate from governance power, but was not selected. One member submits one ballot, weighted only by the community VT balance earned under the active conversion policy; RT, CC, and WC never directly add voting weight.

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
- [Activity rewards influence governance and may encourage farming] → Issue VT only from cumulative RT earned through active, community-approved, rate-limited server-side actions; exclude transferred or spent RT, make VT non-transferable, snapshot balances at proposal opening, and publish each active policy version.
- [An Admin attempts to bypass community approval or changes sensitive parameters] → Enforce role scope in Workers, keep submitted policy immutable and inactive, and activate only after a valid community vote under the prior active rules.
- [AI moderation creates false positives or misses harmful content] → Use temporary holds only, thresholded classification, human review, appeal, and an auditable outcome trail.
- [Two managed providers create operational dependency and lock-in] → Keep Worker API contracts and SQL migrations explicit, document exports/backups and recovery, and describe the result as community-governed hosted infrastructure rather than fully decentralized.
- [Public AI activity leaks sensitive content] → Store minimal structured outcomes, exclude private profile data, and keep raw prompts/responses out of public views by default.
- [Free-tier services cannot meet production demand] → Treat initial rollout as quota-bounded; implement pagination, limits, retention, and graceful degradation, and require a separate decision before any paid upgrade.
- [Browser storage is evicted, full, or unavailable] → Handle failed writes explicitly, keep the remote stores authoritative, bound cached data, and offer a reconnect/reload path without claiming that offline data is a backup.
- [Background Sync is unsupported or delayed] → Retry on startup, foregrounding, and connectivity restoration, and keep queued changes visibly pending until acknowledged.
- [A device remains offline while a server record changes] → Use revisions, tombstones, explicit same-field conflict resolution, and server authority for sensitive outcomes rather than last-write-wins.
- [Action rewards can be farmed through repeated or automated activity] → Reward accepted server-side domain events, require a published rule and unique source key, apply frequency limits (including one login reward per UTC day), and configure per-action caps and abuse monitoring.
- [Transfers or perk redemption create disputes or apparent monetary expectations] → Limit transfers to members of the same community, publish non-cash perk terms, record both sides of a transfer and every redemption, and prohibit cash or external-chain withdrawal.

## Migration Plan

This is a greenfield deployment; there is no existing production data to migrate. Create versioned Supabase, D1, and IndexedDB schema migrations, configure secrets and bindings for a non-production environment, and deploy the Worker API and Pages/PWA shell before enabling scheduled agents. Validate Auth, ownership checks, offline shell startup, local-first reads, bidirectional cursor sync, outbox retry, conflict resolution, task completion/outbox reconciliation, governance snapshots and execution idempotency, and AI hold/review flows with test data. Verify free-tier/account constraints before production setup, then enable agent schedules with conservative limits. Roll back by disabling Cron Triggers and routing traffic away from the new Pages/Worker deployment; preserve database records and use forward migrations or documented exports rather than destructive schema rollback. A service-worker release must retain compatibility with pending outbox records or provide a tested migration before deleting an older cache/database version.

## Open Questions

- Which ZIP/city areas should be enabled for the initial community directory? The first deployment can use an explicit configuration list without changing the architecture or behavior contracts.
- Which initial quorum, approval thresholds, task award rules, conversion ratios, perk prices, and agent schedules should be supplied in deployment configuration? These values must be reviewed before production launch and can later be changed through the community-approved policy flow.