# Tasks

## 1. Align the existing Worker and Groq work

- [ ] 1.1 Reconcile the in-progress `groq-ai-integration` plan with the shared `/api/v1/ai/route` contract, removing the planned provider-specific client route and aligning usage accounting; verify the active plans describe one application endpoint.
- [ ] 1.2 Define typed request, result, provider, and policy configuration contracts and Worker bindings for Supabase, D1, and provider secrets; verify `npm run build` passes and no secret values are committed.

## 2. Add the authenticated routing boundary

- [ ] 2.1 Implement `POST /api/v1/ai/route` request parsing and validation for supported task types, priorities, quality levels, context estimates, payload limits, and agent identifiers; add Worker tests proving invalid requests never dispatch and existing health behavior is preserved.
- [ ] 2.2 Validate Supabase identities before dispatch, derive user attribution from the validated identity, reject mismatched body user IDs, and authorize configured agent/task pairs; add tests for missing, invalid, mismatched, and unauthorized identities that assert no provider call occurs.

## 3. Implement the registry, policy, and provider adapters

- [ ] 3.1 Implement provider capability/configuration registration and a pure policy ranker that filters by task/context, health, and quota and ranks by priority, quality, latency, cost, and quota headroom; add deterministic tests for task types, quality tiers, and batch load spreading.
- [ ] 3.2 Add configured Groq and OpenRouter text adapters, verifying supported models and account access before enabling them; test normalized chat, summary, and classification results, malformed output handling, and provider rate-limit metadata with mocked responses.
- [ ] 3.3 Add Cohere embedding and Fal.ai image-generation adapters behind task capability gates; test validated task-specific result shapes and rejection of unsupported provider capabilities.
- [ ] 3.4 Add a typed application client for the shared route and migrate any existing AI consumers to it; verify client requests contain no provider credentials or provider-specific endpoints and that future agent consumers remain disabled until authorized.

## 4. Add quota reservations and operational signals

- [ ] 4.1 Add a D1 migration for provider health/latency, request outcomes, and time-windowed provider/user/agent usage reservations; verify the migration applies in the existing D1 test setup and stores no prompt, completion, image input, or private profile data.
- [ ] 4.2 Implement atomic request/token reservations, reservation reconciliation, and outcome logging using provider usage and limit headers when available; add concurrent-request tests proving reservations cannot exceed configured budgets and unknown usage remains explicitly estimated.
- [ ] 4.3 Implement provider health and latency windows, quota headroom, cooldowns, and configurable retention/cleanup; add tests for rate-limit reset handling and verify operational records contain only the approved metadata.

## 5. Orchestrate bounded fallback and truthful results

- [ ] 5.1 Implement deadline- and attempt-bounded routing over ranked eligible providers, with no same-request retry after a quota response; test primary success, fallback success, provider timeout, repeated failure, and attempt bounds.
- [ ] 5.2 Return only task-validated CommunityMesh results with actual provider/model and completion, fallback, or degraded status; test malformed output, unavailable outcomes, missing usage metadata, and that raw provider fields and credentials never reach clients.
- [ ] 5.3 Apply soft-cap quality degradation only to eligible non-critical work and preserve explicit unavailable outcomes when no provider remains; test governance frontier preference without a frontier guarantee and verify chat moderation is always rejected from the route.

## 6. Document and stage provider rollout

- [ ] 6.1 Update provider operations documentation with verified model/account limits, source and verification date, configured request/token budgets, cooldown behavior, and a refresh procedure; verify values are deployment-specific and no illustrative quota is presented as account truth.
- [ ] 6.2 Keep all provider/task capabilities disabled by default until required secrets, account limits, model IDs, and budgets are configured; enable summarization and curation first, then embeddings/image generation, followed by dispatcher and maintenance, verifying each stage records correct outcomes and can be disabled independently.
- [ ] 6.3 Run focused Worker tests after each implementation group and, before enabling production traffic, run `npm test`, `npm run build`, and `npm run lint`; verify there is one application endpoint, no browser-visible provider secrets, and bounded fallback under representative load.
