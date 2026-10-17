# Design

## Context

See [proposal.md](./proposal.md) for motivation and [specs/ai-routing/spec.md](./specs/ai-routing/spec.md) for the behavior contract. `src/worker/index.ts` currently dispatches only the versioned health route. `src/worker/env.d.ts` has optional Supabase URL and anonymous-key bindings, and `wrangler.jsonc` already binds D1 as `DB`; the current D1 migration is a governance ledger, not an AI usage ledger. An in-progress Groq proposal separately describes an `/api/v1/ai/groq` route and D1 quota accounting, so implementation must reconcile its provider work with this shared contract before either route is deployed.

## Goals / Non-Goals

**Goals:**
- Keep one stable application contract while providers, model catalogs, and account limits change.
- Make provider eligibility, quota reservation, health signals, and fallback results testable and observable across Worker instances.
- Permit direct provider adapters and router/gateway adapters to participate in the same policy without disclosing their credentials or raw responses.

**Non-Goals:**
- Guarantee a provider, model, latency, free tier, or frontier-quality result for any request.
- Implement per-user billing, provider-console automation, or community-level provider configuration.
- Replace Stream AI Moderation or use Worker inference for chat-content moderation.
- Integrate every provider and gateway named as a possible future option in the first release.

## Decisions

### Use the versioned Worker endpoint as the only application boundary

Implement `POST /api/v1/ai/route` alongside the existing health route. Validate the body and bearer token before provider selection. Resolve the user ID from Supabase Auth; reject a supplied mismatched `user_id`. Treat `agent_id` as a logical task attribution, not proof of authorization: validate it against a configured allowlist and the caller's permitted agent operations. Seed scheduled-agent entries from the four names in the in-progress Groq proposal; add identities for chat, embedding, or image consumers only when those consuming workflows are enabled. Keep provider/model selection out of the public API.

The pending Groq integration is not deployed and its Worker currently has no inference route to preserve. Its Groq adapter, model configuration, and applicable operational knowledge should be reconciled into this route; do not ship a second `/ai/groq` application endpoint or a permanent compatibility alias.

**Alternative considered:** Preserve the provider-specific endpoint and add a general endpoint beside it. Rejected because clients would retain provider coupling and routing policy, authentication, and quota controls could diverge.

### Register adapters by capability and rank eligible providers at request time

Represent each configured adapter with its provider identity, supported task capabilities, model configuration, context limits, quality/cost characteristics, health, and quota state. Initial adapters are Groq and OpenRouter for text, Cohere for embeddings, and Fal.ai for image generation. Exclude candidates that cannot serve the requested task or context, are unhealthy, or lack quota. Rank remaining candidates against requested priority and quality, recent latency and error signals, estimated cost, and remaining quota; use provider rotation for eligible batch work as a tie-breaker to spread usage. Keep policy evaluation separate from network adapters so selection can be tested with fixed signals.

OpenRouter is an initial multi-model router. Cloudflare AI Gateway or Vercel AI Gateway may later wrap a provider adapter for gateway features, and LiteLLM or FreeLLMAPI may later be registered as OpenAI-compatible router adapters; those integrations are not prerequisites for the initial release. If an intermediary identifies the actual model/provider, record both the routing adapter and the actual model identity; otherwise report only the identity it can verify.

**Alternative considered:** Hard-code a provider per task or route every task through one intermediary. Rejected because either choice limits fallback and capability-specific routing and makes quotas or router availability a single point of failure.

### Keep quota and health signals shared through D1

Add a dedicated migration for request outcomes, provider health/latency windows, and time-windowed quota reservations. Reserve estimated request and token capacity at provider, agent, and authenticated-user scopes before dispatch. Use unique request/reservation IDs and conditional atomic D1 updates so concurrent Worker instances cannot all consume the same remaining budget. Release or reconcile reservations after completion; when a provider supplies usage or rate-limit/reset headers, use those values, and otherwise retain conservative estimates and mark usage as estimated or unknown.

Do not store prompts, completions, image inputs, or private profile fields in the operational ledger. Record only identity attribution, task type, provider/adapter and model identifiers where known, estimated and reported usage, latency, outcome, fallback decision, and timestamps. Define configurable retention and cleanup for request-level events before production rollout; aggregate quota and health counters only as long as operationally needed. Treat provider counters as safeguards, not billing records or exact account truth.

**Alternative considered:** Keep counters in memory or rely only on provider headers. Rejected because Worker instances do not share process memory and headers do not provide complete, race-safe per-user or per-agent budgets.

### Validate identity, provider results, and task result shapes at the boundary

Use Supabase Auth to validate the access token using the existing Worker Supabase configuration. After authorization and request validation, select an adapter, build its provider-specific request internally, and normalize its response into the requested CommunityMesh result schema before returning it. Keep API keys in Worker secret bindings, never in the browser or committed configuration. Treat moderation requests as unsupported at this route so Stream remains the sole automated chat moderator.

**Alternative considered:** Return OpenAI-compatible or provider-native payloads unchanged. Rejected because providers differ in response shape, may add unrelated fields, and must not define the client contract.

### Bound retries and make fallback outcomes explicit

Attempt the ranked candidate list only within a configured request deadline and maximum attempt count. Do not retry a provider after a quota response in the same request; honor `Retry-After` and provider reset signals for later eligibility. On transport, server, or schema failure, record the outcome and proceed only to a different eligible configured candidate. Return the actual successful provider/model and whether it was a fallback or degraded quality. If all attempts fail, return an explicit unavailable/error result; do not turn a timeout, stale value, or heuristic into a fresh completion. Application-level cached AI results are not part of the initial release; a later gateway cache must be configured only for tasks whose freshness and privacy requirements permit it.

**Alternative considered:** Retry the same provider without limit or silently return cached/default output. Rejected because retries amplify quota pressure and success-shaped defaults misrepresent whether inference occurred.

### Stage integrations by task and provider

First reconcile the Groq integration plan and add shared authentication, quota, routing, and result contracts. Enable text summarization/curation with Groq and OpenRouter, then add Cohere embeddings and Fal.ai image generation behind their capability gates. Roll the remaining dispatcher and maintenance consumers on only after their task policies and budgets are configured. Verify deployed-account model access, limits, service terms, and secrets during rollout rather than assuming free quotas from examples. Roll back by disabling an adapter or task capability; keep the shared endpoint available to return a truthful unavailable result.

**Alternative considered:** Enable every provider and task at once. Rejected because it increases operational and quota risk before health, latency, and fallback behavior are observed.

### Resolve quality and community-policy questions with explicit defaults

Use `frontier`, `balanced`, and `cheap` as ranking preferences constrained by policy, capability, health, and budget. A governance-related caller may request frontier quality, but the route does not guarantee a frontier model when unavailable or over budget. Log minimal request-level routing decisions and outcomes for quota accounting and diagnosis without retaining prompts. Defer per-hub provider preferences until the platform defines their governance, validation, and quota-isolation semantics.

**Alternative considered:** Guarantee frontier models for governance or let each hub choose providers immediately. Rejected because guarantees could bypass shared limits, while hub-level overrides require policy and isolation rules not present in the current data model.

## Risks / Trade-offs

- [Free-tier quotas, model identifiers, and provider terms change] → Keep limits and model IDs configurable; verify actual deployment accounts and provide provider-specific cooldowns and health state.
- [D1 is a shared bottleneck for reservations] → Keep reservation transactions short, index time-window lookups, and load-test concurrent reservations before increasing traffic.
- [Provider output quality and schemas vary] → Normalize and validate every task result; use bounded fallbacks and return explicit errors when no result passes validation.
- [Routing metadata can reveal usage patterns] → Exclude prompt/content data, restrict event access, and configure event retention and aggregation before production use.
- [Gateway routing can obscure the serving model] → Distinguish the gateway adapter from the actual provider/model and report only metadata verified in the response.

## Migration Plan

1. Before implementation, reconcile `groq-ai-integration` with this contract; verify the effective deployment's Supabase, D1, and Worker bindings and the selected providers' current models and account limits.
2. Add the AI usage/health migration and typed Worker secret/configuration bindings without storing secret values in source control. Add policy defaults and request/result types.
3. Implement authorization, request validation, provider registry and adapters, deterministic policy ranking, D1 reservations/reconciliation, bounded fallback, and Worker tests while keeping provider access disabled by default.
4. Enable text summarization and curation at conservative limits; validate auth, outcomes, quota races, latency, errors, and fallback metadata under representative load.
5. Enable embeddings and image generation after their adapters and task output contracts are verified; stage dispatcher and maintenance consumers after their budgets are configured.
6. Roll back by disabling affected provider/task configuration and returning explicit unavailable results. Preserve sanitized operational events for diagnosis, and do not restore a provider-specific client route.

## Open Questions

- What model IDs, account limits, and provider credentials are available in the deployment's actual provider accounts?
- What numeric request/token limits, soft-cap thresholds, safety margins, latency windows, and request-event retention period should production configuration use?
