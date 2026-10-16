# Tasks

## 1. Worker inference boundary

- [ ] 1.1 Add typed Worker configuration for Groq, optional Together AI/Cohere/Hugging Face fallback credentials, model roles, and quota settings; verify missing required configuration fails explicitly and `npm run build` passes.
- [ ] 1.2 Add the authenticated `ai/groq` Worker route with Supabase token validation and an allowlist for `ai_summarizer`, `ai_curator`, `ai_task_dispatcher`, and `ai_maintenance`; add tests proving unauthenticated, unknown-agent, and moderation requests never call a provider.
- [ ] 1.3 Implement Groq request/response adapters using the verified model-compatible completion endpoint and map each agent to its requested model role; validate current model availability against Groq's catalog and test all four mappings plus structured response validation with mocked provider responses.

## 2. Quota controls and graceful fallback

- [ ] 2.1 Add the D1 usage ledger and atomic minute/day quota reservations for provider, agent, and user scopes; test that concurrent reservations cannot exceed configured request/token budgets and that usage records exclude prompts and private profile fields.
- [ ] 2.2 Reconcile reservations with provider-reported token usage and rate-limit headers, record success/failure/quota outcomes, and honor reset/`Retry-After` data without unbounded retries; test normal responses, missing usage metadata, and 429 responses.
- [ ] 2.3 Add bounded Together AI/Cohere/Hugging Face fallback routing and explicit cached/local/unavailable result states; test fallback success, exhausted fallback budget, malformed provider output, and offline behavior without success-shaped results.

## 3. Groq operational limits guide

- [ ] 3.1 Create `openspec/operations/groq-limits.md` with direct links to `https://console.groq.com/settings/limits` and `https://console.groq.com/docs/rate-limits`, a verification date, deployment account/model RPM, RPD, TPM, TPD and any separate input/output token limits, plus reset/header behavior; verify each reported value against the target Groq console and official documentation and mark unavailable values explicitly rather than using examples.
- [ ] 3.2 Complete the guide's concurrency section, per-user/per-agent/per-community usage mapping, scheduled-run assumptions, and normal/burst/worst-case scenarios (proposal spikes, mass task submissions, and community events); include the required Agent/Model/Expected Calls per Day/Token Budget/Notes table for all four agents and calculate budgets from verified limits with stated headroom and active-community assumptions.
- [ ] 3.3 Document throttle, fallback, graceful-degradation, and maintainer-alert actions, using 70% alert, 80% capacity-review, and 90% controlled-degradation thresholds as CommunityMesh policy rather than Groq limits; include the requirement to update values, date, and budgets whenever official Groq limits or workload assumptions change, and verify the guide's formulas, source links, table, and update instruction.

## 4. Integration and staged rollout

- [ ] 4.1 Add end-to-end Worker tests for all four agent routes, authorization, quota rejection, fallback metadata, and explicit unavailable outcomes; run the focused Worker tests and verify no route can invoke Groq for moderation.
- [ ] 4.2 Enable the summarizer first with conservative configured budgets, verify D1 usage records and quota alerts under representative load, then document the observed results and staged enablement criteria for curator, dispatcher, and maintenance.
- [ ] 4.3 Run `npm test`, `npm run build`, and `npm run lint`; resolve regressions and verify the operational guide matches the final deployed model configuration and calculated quotas before enabling the remaining agents.
