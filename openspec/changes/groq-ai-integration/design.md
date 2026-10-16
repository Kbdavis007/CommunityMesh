# Design

## Context

See [proposal.md](./proposal.md) for motivation. The Worker currently has only a health endpoint and optional Supabase URL/anonymous-key bindings. The in-progress AI operations design expects AI activity to be bounded, observable, advisory, and auditable; the new [ai-inference spec](./specs/ai-inference/spec.md) defines the behavior contract.

Groq's rate-limit documentation describes request and token windows (RPM, RPD, TPM, TPD, with optional separate input/output token limits), organization-level enforcement, rate-limit response headers, and HTTP 429 responses. The account limits page loads organization-specific values and is not readable without an authenticated console session. Thus provider values must be captured from the deployment's actual console, not inferred from illustrative headers or generic examples. Provider documentation does not establish a universal concurrency quota; the guide must report what the account actually exposes and separately define an internal concurrency cap if needed.

## Goals / Non-Goals

**Goals:**
- Keep provider access and credentials behind the Worker; authenticate each user request before provider access.
- Give each agent a model role and constrain request/token use across user, agent, and provider scopes.
- Make failures, fallbacks, and cached/local degraded results visible to callers and in operational records.
- Make the operational guide reproducible from current account limits and explicit workload assumptions.

**Non-Goals:**
- Groq inference for chat moderation, which remains with Stream AI Moderation.
- Browser-to-provider calls or disclosure of raw provider payloads.
- Treating a provider quota or model catalog as immutable, or promising a permanent free tier.
- Automating provider-console access or billing analytics as part of this change.

## Decisions

### Keep inference behind the existing Worker surface

Add the `ai/groq` domain under the existing versioned Worker API (for example, `/api/v1/ai/groq`) rather than exposing a provider endpoint to the browser or creating a separate Worker deployment. Validate the Supabase access token and the agent/task allowlist before any provider call. Bind provider credentials as Worker secrets; add typed binding names without values to the Worker environment contract. Return only a schema-validated CommunityMesh result with provider, model, and explicit completion/degraded status.

**Alternative considered:** Call Groq directly from the client. Rejected because it exposes the API key and bypasses centralized authorization and quota controls.

### Route by agent role and use provider adapters

Use the requested model roles: Llama 3.1 70B for summaries and governance analysis, Qwen 2.5 72B for structured classification and dispatch, and Llama 3.1 8B for lightweight maintenance operations. Map summarizer to the summary role, curator and dispatcher to the structured role, and maintenance to the lightweight role. Keep model IDs configurable and verify their current availability, API compatibility, and account access against Groq's model catalog before deployment; if a requested model is unavailable, select an explicitly approved supported replacement and update the limits guide and budget rather than silently substituting it. Implement a Groq adapter that selects `/v1/chat/completions` or `/v1/completions` as required by the verified model API, plus provider-specific request/response adapters for configured Together AI, Cohere, or Hugging Face fallbacks.

**Alternative considered:** Hard-code model IDs or pass provider response objects through the API. Rejected because catalog changes are expected and provider response formats are not the CommunityMesh contract.

### Reserve quota before dispatch; log actual usage after completion

Use D1 as the durable operational ledger for time-bucketed usage and run outcomes, consistent with the project's planned Worker/D1 architecture. Track user and agent attribution, provider/model, decision, input/output token counts when available, timestamps, and outcome; retain only aggregate/minimal operational data and do not copy prompts or private profile fields into broadly visible activity records. Estimate input tokens before dispatch and reserve request/token budget atomically against configured minute/day windows so concurrent requests cannot all pass the same remaining budget. Reconcile the reservation with provider-reported usage after completion and record failures or unknown usage explicitly.

Treat Groq's account limits as shared provider ceilings, not user quotas. Allocate configurable per-agent reservations beneath those ceilings, then enforce per-user soft caps within each agent's allocation. Honor provider remaining/reset headers and `Retry-After` where present; treat 429 as a quota outcome, avoid unbounded retries, and reserve a configurable safety margin for header lag, usage estimation error, and other organization traffic. Internal counters are protective estimates, not billing or provider-console truth.

**Alternative considered:** Keep counters only in Worker memory or trust each request's rate-limit headers independently. Rejected because Worker instances do not share in-memory state and parallel requests can overspend a shared budget.

### Make provider fallback bounded and observable

When Groq is unavailable or an internal/provider quota blocks the request, attempt only configured fallback providers and only within their own credentials and budget. Do not chain retries indefinitely: bound the attempt count and deadline, distinguish a fallback success from a Groq success, and record which provider actually served it. If providers are exhausted, return a typed unavailable result or use a relevant local heuristic/cached summary; never present a stale or heuristic value as fresh model output. The client-facing behavior can be wired as the application gains its inference consumers; the Worker must already return enough status for that distinction.

**Alternative considered:** Retry Groq until it recovers. Rejected because retries amplify quota pressure and delay work without a predictable completion path.

### Derive the quota guide from live limits and workload assumptions

Create `openspec/operations/groq-limits.md` as an operational document, not a change-planning artifact. Capture the direct official limits URL and rate-limit documentation URL, a verification date, account/model-specific RPM, RPD, TPM, TPD and any separate ITPM/OTPM limits shown, and the applicable reset/header semantics. If the console does not publish a concurrency ceiling, state that it is unavailable as a provider quota and set a separate CommunityMesh concurrency cap based on Worker capacity and bounded latency.

For each agent, model, and fallback, record assumed calls/day, input/output tokens per call, scheduled cadence, and any batching assumptions. Calculate safe daily call/token budgets from the lowest applicable provider constraint with a documented reserve; do not use the documentation site's illustrative values as account quotas. Derive a per-user allowance from the remaining capacity and an explicitly named active-user/community-size assumption. Include normal scheduled usage, typical user-triggered use, and burst cases (proposal spikes, mass task submissions, and community events), showing whether each case fits, throttles, falls back, or degrades. Use the repository's existing internal quota guidance as a starting policy—alert at 70%, review capacity at 80%, and controlled degradation by 90%—and identify these as CommunityMesh thresholds, not Groq limits.

The quota table must include the four agents and the requested fields: Agent, Model, Expected Calls/Day, Token Budget, and Notes. Recalculate it when model assignments, workloads, fallback configuration, or official quotas change; include the review/update instruction in the document itself.

**Alternative considered:** Publish a single hard-coded free-tier number or promise a fixed per-user count. Rejected because Groq values are account/model-specific, organization-shared, and subject to change; a fixed number could exceed the deployment's actual quota.

## Risks / Trade-offs

- [Account-specific quotas differ from examples or change over time] → Record dated values from the deployment console and official docs; budget below the tightest applicable window and recalculate on review.
- [Token estimates or response headers lag actual concurrent usage] → Reserve capacity atomically, use a safety margin, reconcile actual token counts, and degrade before the provider hard limit.
- [Fallback quotas may be exhausted or have different structured-output behavior] → Validate each adapter against the shared result schema and independently budget/observe fallback usage.
- [D1 ledger growth or availability affects quota enforcement] → Keep records aggregated and bounded by retention policy; fail closed for paid/provider inference if quota state cannot be safely established, with explicit degraded behavior.
- [Provider model/API changes break routing] → Keep IDs configurable, validate model availability and response schemas before deployment, and expose provider/model-specific failures in logs.

## Migration Plan

1. Confirm deployed Worker, D1 binding, auth-token validation approach, and provider account/model access; capture the actual Groq limits and baseline workload assumptions.
2. Add secrets and non-secret configuration for Groq, selected model roles, quota headroom, authorized agents, and optional fallback providers; never check credentials into source control.
3. Add the Worker route, provider adapters, quota reservation/usage ledger, and tests for authorization, quota races, provider errors, fallback, and degraded responses.
4. Create and review `openspec/operations/groq-limits.md` before enabling production traffic. Confirm its calculated budgets and alerts against the target deployment's live limits.
5. Enable the summarizer first, observe usage and latency, then enable curator, dispatcher, and maintenance incrementally while monitoring quota and fallback outcomes.
6. Roll back by disabling the Groq route/configuration and returning eligible agents to their existing non-Groq behavior or explicit unavailable/degraded results. Preserve usage records for diagnosis; do not silently route moderation through another inference path.

## Open Questions

None that block the architecture. The exact account quotas, selected model IDs available to the deployment, active-community assumptions, and numeric per-user/per-agent allocations are deployment facts to verify and document as part of the implementation and operational guide.
