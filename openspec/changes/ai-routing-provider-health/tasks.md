# Tasks

## 1. Provider and community policy persistence

- [ ] 1.1 Add an additive D1 migration for `ai_provider`, `ai_provider_health`, `ai_provider_usage`, `ai_user_budget`, and `ai_agent_budget`, with composite keys, foreign keys, JSON/status/range checks, per-minute window tracking, and lookup indexes; verify the migration tests cover valid inserts, invalid values, keys, and indexes.
- [ ] 1.2 Extend the versioned community policy contract with typed AI routing preferences and platform allowlist validation; verify tests accept valid preferences and reject malformed chains, unknown catalog entries, and unauthorized policy changes.

## 2. Default chains and policy-aware ranking

- [ ] 2.1 Add the configured task-to-provider/model chains from the spec and validate provider capability, model availability, and context requirements; verify routing policy tests cover every task chain and skip disabled or unavailable models.
- [ ] 2.2 Resolve active community preferences and rank candidates using task priority, quality, context, health, latency, quota headroom, and user/agent soft caps; verify tests cover override precedence, the 90% daily-token threshold, realtime latency, and per-case governance quality.

## 3. Health sampling and adaptive cooldown

- [ ] 3.1 Persist timestamped provider health samples and expose current health, latency, error-rate, and rate-limit signals to the router; verify tests cover status constraints, latest-sample selection, and stale health handling.
- [ ] 3.2 Implement bounded adaptive cooldowns using configured defaults, repeated failures, rate-limit thresholds, retry/reset guidance, and recovery evidence; verify tests cover minimum/maximum bounds, 429 handling, cooldown expiry, and recovery.

## 4. Usage budgets and reservations

- [ ] 4.1 Update provider, user, and agent daily and per-minute usage aggregates and reconcile reservations with reported provider usage; verify accounting tests cover UTC date/window rollover, hard limits, soft caps, and failure release.
- [ ] 4.2 Make provider, user, and agent request/token reservations atomic across concurrent Worker requests; verify contention tests admit only reservations within remaining quota and reject over-budget dispatches.
- [ ] 4.3 Record sanitized routing outcomes without prompts, completions, or credentials; verify tests inspect persisted records for allowed metadata and absence of sensitive payload fields.

## 5. Integration and operations

- [ ] 5.1 Integrate policy and health-aware selection into the shared AI route without adding a provider-specific client endpoint; verify Worker integration tests cover community overrides, fallback order, and explicit unavailable outcomes.
- [ ] 5.2 Update provider operations guidance with catalog/model verification, quota thresholds, cooldown controls, and staged community override rollout; verify documented configuration names and rollout steps match the implementation.
- [ ] 5.3 Run the focused D1 migration and Worker routing tests, then the project test suite; verify all checks pass and migration behavior remains compatible with the existing governance ledger.
