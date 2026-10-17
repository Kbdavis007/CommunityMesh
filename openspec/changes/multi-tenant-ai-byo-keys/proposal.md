# Proposal

## Why

CommunityMesh currently has no implemented AI inference route or tenant-owned provider credential management, while in-progress OpenSpec changes define a shared provider router and AI operations. Letting members securely connect their own supported AI providers can reduce reliance on site-funded quotas and improve availability, provided user keys remain isolated and the existing platform routing and safety policies remain authoritative.

## What Changes

- Let authenticated members add, validate, activate, deactivate, update, and remove their own provider credentials for Groq, OpenRouter, Gemini Flash, Cohere, Fal.ai, Together AI, and HuggingFace.
- Store credentials only in a server-controlled, encrypted form; never return plaintext keys to clients, log them, or allow one tenant's key to be used for another tenant.
- Extend the shared AI routing boundary to prefer the requesting member's active, compatible configured providers. Fall back to the site AI routing layer on configured provider quota exhaustion, errors, timeouts, or invalid responses, using bounded attempts and preserving the existing output validation and guardrails.
- Record per-user provider usage and outcomes for quota enforcement and account visibility without retaining prompts or other sensitive request payloads.
- Award Reward Tokens for eligible BYO onboarding, successful own-provider use, and usage milestones through existing versioned reward policies and an idempotent ledger; do not hard-code amounts or award rules in routing logic.
- Preserve the shared router's task capability checks, authentication, abuse controls, and moderation boundaries. A BYO key does not change global routing policy or bypass validation.
- Define the tenant profile and routing behavior as additive capabilities and coordinate their integration with the in-progress `multi-provider-ai-router`, `ai-routing-provider-health`, `groq-ai-integration`, and DAO reward work to avoid duplicate endpoints, incompatible accounting, or competing reward sources.

## Capabilities

### New Capabilities

- `ai-tenant-profiles`: Member-owned provider credential lifecycle, isolation, secure storage, and configuration.
- `ai-tenant-routing`: Tenant-first provider selection, site-router fallback, per-user usage accounting, and policy-governed BYO rewards.

### Modified Capabilities

None. There are no canonical capability specs under `openspec/specs/`; the related AI router and rewards requirements currently exist only in in-progress change deltas.

## Impact

- **Worker API:** `src/worker/index.ts` currently exposes only `GET /api/v1/health`; tenant profile operations and inference must integrate with the shared authenticated router rather than create a competing provider-specific client route.
- **Persistence and secrets:** `wrangler.jsonc` binds the Worker to D1 and Workers AI. The D1 governance ledger already stores RT balances and append-only idempotent token entries, but there is no tenant credential or AI usage schema. Implementation must choose a production-safe encryption key-management strategy and avoid plaintext credential persistence.
- **Provider adapters:** The requested providers have different task capabilities, request formats, quota signals, and output shapes. User-first routing must select only compatible providers and use the site's configured provider chain when user-owned inference cannot serve a request.
- **Rewards:** Integrate BYO reward events with the existing versioned reward policy and token ledger. Exact reward amounts, eligibility windows, and milestone thresholds are configuration decisions and must not be invented as fixed product values.
- **Related changes:** Reconcile the shared route and accounting with `multi-provider-ai-router` and `ai-routing-provider-health`, provider adapter work in `groq-ai-integration`, and the DAO platform's reward rules. No chat moderation behavior changes.

## Planning Assumptions

- The provided request ends partway through its D1 schema description. This proposal treats the listed `ai_tenant_profile` and `ai_tenant_usage` tables as conceptual requirements, not a complete migration contract; the design will specify safe ownership, encryption, retention, and indexing.
- “Provider first” means trying only active providers the member configured that support the requested task, in a deterministic configured order. No provider key is shared across users, and unconfigured capabilities continue directly through the site router.
- Provider quota thresholds and BYO reward rates are configurable policy values. The initial implementation must not guess provider quota numbers or token reward economics.
- A provider failure may trigger site fallback only within request deadlines and platform retry limits. Existing moderation, authorization, and output validation remain in force regardless of provider.
