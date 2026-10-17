# Proposal

## Why

CommunityMesh's Worker currently exposes only a health endpoint, while the in-progress Groq integration proposes a provider-specific inference route. A single policy-driven routing boundary will let the application use multiple model providers without coupling callers to provider APIs, exposing credentials, or relying on one provider's availability and quotas.

## What Changes

- Add a versioned Worker endpoint, `POST /api/v1/ai/route`, as the sole application entry point for supported AI work. Requests identify task type, priority, quality, estimated context size, agent, and task payload; the authenticated identity is derived from Supabase Auth rather than trusted from a caller-supplied user ID.
- Add a provider registry and routing policy that rank configured providers by task capability, priority, quality, context limits, health, latency, quota headroom, and usage budgets. Return a validated CommunityMesh result with provider/model and fallback or degraded status, never raw provider responses.
- Begin with the provider set in the supplied migration plan: Groq and OpenRouter for text, Cohere for embeddings, and Fal.ai for image generation. Keep provider adapters configurable so additional providers or gateways can be added without changing the client contract; do not require every named provider or gateway in the first rollout.
- Add D1-backed provider, per-user, and per-agent usage and health signals; enforce bounded quotas and concurrent reservations, use configured fallback chains, and explicitly report unavailable outcomes when no eligible provider can serve a request.
- Keep provider credentials in Worker secrets. Continue to use Stream AI Moderation as the sole chat-content moderation service; the routing endpoint does not perform chat moderation.
- Reconcile the in-progress Groq-specific inference change with this shared routing contract so the application does not gain competing provider-specific and provider-neutral entry points.
- Log minimal per-request routing and outcome metadata for operations and quota accounting, without retaining prompts or sensitive payloads. Defer community-configured provider preferences. Governance-related requests express quality needs through policy but are not guaranteed a frontier model regardless of availability or budget.

## Capabilities

### New Capabilities

- `ai-routing`: Provider-neutral AI request routing, policy-based provider selection, quota and health awareness, and explicit fallback outcomes behind a single Worker endpoint.

### Modified Capabilities

None. There are no canonical specs in `openspec/specs/` yet. The in-progress `groq-ai-integration` change defines overlapping `ai-inference` behavior; implementation must align it with this routing capability rather than preserve a second public inference route.

## Impact

- **Worker API:** `src/worker/index.ts` currently handles only `GET /api/v1/health`; add authenticated request validation and the versioned AI routing endpoint.
- **Worker configuration and persistence:** `src/worker/env.d.ts` currently declares optional Supabase URL and anonymous-key bindings; provider secret/configuration bindings and D1 usage/health storage will be needed. `wrangler.jsonc` already binds D1 and Workers AI.
- **Tests and operations:** Extend `src/worker/index.test.ts` for authorization, routing decisions, provider failures, quota reservation, fallback, and safe results. Existing D1 migrations contain governance tables but no AI usage ledger; add routing-specific schema and operational guidance during implementation.
- **Application and external services:** Callers will use the shared contract rather than provider-specific APIs. Initial integrations use Groq, OpenRouter, Cohere, and Fal.ai; other providers and gateways remain optional additions.
- **Related work:** Coordinate the endpoint and provider abstraction with `openspec/changes/groq-ai-integration` before implementation to prevent duplicate routes and incompatible usage accounting.
