# Design

## Context

See [proposal.md](./proposal.md) and [specs/ai-routing/spec.md](./specs/ai-routing/spec.md). The active `multi-provider-ai-router` change defines a shared Worker route and reservation-based accounting, but defers community routing preferences. In the current repository, `src/worker/index.ts` only implements the health route; `wrangler.jsonc` binds D1 as `DB`; migration `0001_governance_ledger.sql` contains versioned community policies and `ai_run_logs`, but no provider catalog, health samples, quota aggregates, or budgets.

## Goals / Non-Goals

**Goals:**
- Keep the task routing table, community preferences, provider health, and usage accounting coherent without adding another application-facing inference endpoint.
- Make current health and quota signals usable by routing decisions across Worker instances.
- Preserve a truthful, bounded fallback path when policy or provider state excludes a preferred model.

**Non-Goals:**
- Guarantee availability of any named provider, model, or free tier.
- Let community preferences bypass platform safety rules, provider allowlists, hard quota limits, or caller authorization.
- Store provider credentials or AI prompt/completion content in D1.
- Replace the shared router's authentication, adapter, result validation, and fallback contract.

## Decisions

### Treat task chains as defaults, not unconditional provider assignments

Use the ordered chains in the spec as the baseline for each task. Keep provider/model identifiers in the configurable catalog and mark unavailable or unverified entries ineligible rather than silently replacing their identity. Apply request quality, context requirements, policy, and budgets before dispatch. An active community preference may reorder or narrow eligible choices, but must not introduce arbitrary URLs, models outside the catalog, or providers outside the platform allowlist.

**Alternative considered:** Bind each task permanently to one provider. Rejected because it defeats the requested fallback chains and cannot react to provider health, availability, or community policy.

### Use health and quota as eligibility and ranking signals

Read the latest provider health sample and usage state for each candidate. Exclude offline providers and those still in cooldown; lower the rank of degraded or near-quota providers. Treat daily use above the configured 90% threshold as a deprioritization signal, and enforce hard per-minute and configured request/token limits. Compare latency most strongly for realtime tasks; for batch or low-priority tasks prefer lower cost when quality and capability remain acceptable. Keep task-chain order as the deterministic tie-breaker.

For user and agent soft caps, allow policy to select a cheaper eligible provider for non-critical work or return a clear budget outcome when no permitted option remains. Governance analysis follows its per-request risk, priority, quality, and budget; it is not categorically assigned frontier models.

**Alternative considered:** Rank by latency alone or treat the listed order as immutable. Rejected because either approach ignores quality, context, quota, and budget requirements or makes health-aware fallback ineffective.

### Persist catalog, health samples, and quota aggregates in an additive D1 migration

Add a new migration after `0001_governance_ledger.sql`; do not revise the existing migration. Use `ai_provider.provider_id` as the catalog key and validate JSON capabilities and model catalog values. Key `ai_provider_health` by provider and sample timestamp, retaining history and indexing provider/time for latest-sample reads. Constrain status values and nonnegative measurements; define `error_rate` as a percentage from 0 through 100.

Key `ai_provider_usage` by provider and UTC date. The rolling per-minute counters need an explicit minute-window start so a reset or process restart cannot make an old counter appear current. Key `ai_user_budget` by user and UTC date and `ai_agent_budget` by agent and UTC date. These user and agent identifiers are application identities, not D1 foreign keys to Supabase. Add checks for nonnegative totals/caps and indexes for the actual provider, user, agent, and date lookup patterns.

Keep request-level reservations and outcomes in the shared router's ledger rather than treating daily aggregate rows as a concurrency primitive. Reserve provider, user, and agent capacity with unique request IDs and conditional atomic D1 updates; reconcile or release the reservation after dispatch. Health samples and aggregates must not contain prompts, completions, or provider secrets.

**Alternative considered:** Keep health and quotas only in Worker memory or infer them solely from provider response headers. Rejected because state would not be shared across Worker instances and headers cannot provide complete per-user or per-agent accounting.

### Store community preferences in the active versioned community policy

Add a typed routing-preference field to the existing community policy contract and read it from the active policy version for the request's community. Reuse policy versioning rather than creating an independent mutable preference store. Update policy validation to reject malformed task chains, unknown catalog entries, and values outside the community's allowed scope. Platform limits and task eligibility remain authoritative regardless of the community's requested order.

**Alternative considered:** Add a second community routing table with its own activation lifecycle. Rejected because it would duplicate the existing versioned policy mechanism and risk a preference becoming active independently of the policy version that authorized it.

### Adapt cooldowns from bounded static defaults

Configure a safe baseline, minimum, and maximum cooldown per provider or provider class. A 429 response uses valid `Retry-After` or reset guidance, bounded by the configured maximum; repeated transport or server failures increase the cooldown within those bounds. Successful health samples and elapsed time reduce the adaptive penalty gradually. Persist `cooldown_until` in provider health state so all Worker instances observe the same decision. Keep failure thresholds and observation windows configurable; do not infer provider recovery solely from an expired timer when current health data says offline.

**Alternative considered:** Use only a fixed cooldown or allow unbounded exponential backoff. Rejected because a fixed duration ignores provider feedback and repeated failures, while unbounded backoff can strand a recovered provider.

## Risks / Trade-offs

- [Provider model names, account access, and quotas change] → Make catalog entries and limits configurable, verify them against deployed accounts before enabling a provider, and keep unsupported entries ineligible.
- [A stale health sample may exclude a recovered provider or select a failing one] → Timestamp samples, define freshness windows, retain bounded fallback, and treat missing/stale health conservatively according to policy.
- [Community preference data can conflict with system safety or budget rules] → Validate it against a platform allowlist and active versioned policy; enforce hard limits after preference resolution.
- [D1 writes for reservations and health samples can consume quota] → Avoid writing every health poll, aggregate request/token counters, index bounded reads, and monitor D1 row usage before production rollout.
- [An adaptive cooldown can oscillate or over-penalize a provider] → Bound it, use configurable thresholds and observation windows, and decay penalties only from successful health evidence.

## Migration Plan

1. Reconcile the requirements with `multi-provider-ai-router` and `groq-ai-integration`; verify the configured model catalog, account limits, and provider retry/reset behavior before enabling entries.
2. Add an additive D1 migration for provider catalog, health samples, provider usage, and user/agent budgets, including checks, composite keys, foreign keys where applicable, and query indexes.
3. Extend the active community policy schema with a validated routing-preference field and seed or configure task default chains without storing secrets in D1.
4. Implement deterministic ranking, health/quota eligibility, adaptive cooldown updates, and atomic reservations; test policy resolution and concurrent quota contention.
5. Enable providers and community overrides incrementally with conservative budgets; monitor health freshness, fallback rates, cooldowns, and D1 usage. Roll back by disabling the affected entry or override and use the existing explicit unavailable behavior.

## Open Questions

- Which exact model IDs and account quota limits are enabled for each provider at deployment time?
- What production values should configure health freshness, rate-limit thresholds, per-minute windows, minimum/maximum cooldowns, and user/agent soft caps?
