# Proposal

## Why

The provider-neutral router plan needs an explicit task-to-provider order and durable health and quota signals to make its routing behavior predictable. Community-level preferences, case-by-case governance quality, and adaptive cooldown policy also need clear precedence so local choices remain within platform safety and budget constraints.

## What Changes

- Extend the in-progress `ai-routing` capability with a configurable provider priority chain for each supported AI task, using the supplied provider/model order as defaults rather than guarantees of availability.
- Add D1-backed provider metadata, timestamped health samples, provider quota usage, per-user budgets, and per-agent budgets, while retaining atomic reservations and request-outcome accounting from the shared router design.
- Permit authorized community policies to override routing preferences within platform-configured provider, quality, health, and budget constraints.
- Choose governance-analysis quality per request and policy risk; do not require frontier models for every governance task.
- Use adaptive provider cooldowns based on observed failures, rate limits, and provider retry/reset signals, bounded by configurable safe static defaults and real-time policy limits.
- Supersede the `multi-provider-ai-router` design's deferral of community preferences; this change adds routing policy and health persistence, not another public endpoint or provider adapter layer.

## Capabilities

### New Capabilities

- `ai-routing`: Task-specific provider ranking, community-scoped routing preferences, health-aware eligibility, adaptive cooldowns, and durable quota-budget signals. This extends the same in-flight capability introduced by `multi-provider-ai-router`.

### Modified Capabilities

None. The repository has no canonical specs under `openspec/specs/`; this change and the in-progress router change both contribute delta requirements for `ai-routing`.

## Impact

- Worker routing policy and its tests; `src/worker/index.ts` currently serves only the versioned health endpoint.
- A new D1 migration and migration tests; the existing migration has `ai_run_logs` but no provider health, quota, or budget tables.
- Existing community policy versioning can anchor authorized, versioned overrides; implementation must define the override field and preserve system-level limits.
- The existing `multi-provider-ai-router` proposal/design and `groq-ai-integration` work must be reconciled so their routing and accounting requirements remain coherent.
