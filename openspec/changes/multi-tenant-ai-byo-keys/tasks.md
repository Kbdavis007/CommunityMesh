# Tasks

## 1. Reconcile shared contracts and persistence

- [ ] 1.1 Reconcile this change with the in-progress shared router, provider-health, Groq adapter, and DAO reward changes so implementation has one authenticated inference contract, provider registry, usage ledger, and reward source; verify the integrated design contains no duplicate public route or competing accounting table.
- [ ] 1.2 Add the D1 migration for owner-scoped tenant profiles, per-attempt tenant usage, and any shared reservation/outbox extensions; verify migration tests cover constraints, indices, concurrent reservation limits, and compatibility with the existing governance ledger.
- [ ] 1.3 Implement versioned AES-GCM credential encryption and decryption using a deployment-only Worker secret, owner/provider-bound authenticated data, and rotation handling; verify unit tests cover round-trip, tampering, wrong-owner binding, missing keys, and key-version rotation, and document secret provisioning without recording secret values.

## 2. Add provider configuration and profile management

- [ ] 2.1 Implement the trusted registry and adapters for Groq, OpenRouter, Gemini Flash, Cohere, Fal.ai, Together AI, and HuggingFace with explicit task capabilities and normalized usage, quota, and failure outcomes; verify mocked contract tests cover each adapter and unsupported capability combinations.
- [ ] 2.2 Implement authenticated tenant profile create, read, update, activate, deactivate, and delete operations using only the validated identity as owner; verify route tests cover cross-tenant denial, masked profile responses, no-store responses, and removal disabling subsequent use.
- [ ] 2.3 Implement server-side provider credential validation using trusted provider endpoints and safe error handling; verify tests cover valid/invalid credentials, provider unavailability, rejected arbitrary endpoints, and absence of plaintext keys in responses and captured logs.

## 3. Route and account for tenant inference

- [ ] 3.1 Extend the shared AI router to preflight eligible tenant providers in configured order before the site chain while preserving shared authentication, task validation, moderation, and output checks; verify tests cover tenant-first routing, direct site routing when no tenant provider is eligible, and platform-policy exclusions.
- [ ] 3.2 Add bounded provider retry and site fallback for tenant quota exhaustion, errors, timeouts, and invalid output; verify tests assert attempt/deadline bounds, actual-provider reporting, and explicit unavailable results when all routes fail.
- [ ] 3.3 Integrate atomic quota reservation and settlement with `ai_tenant_usage`, recording provider attempts and available usage without prompts or secrets; verify tests cover concurrent quota contention, failed-attempt records, usage reconciliation, and reservation expiry.
- [ ] 3.4 Provide an authenticated member-scoped usage summary with provider/period usage and configured quota state; verify tests cover empty results, available usage data, and denial of another member's summary.

## 4. Integrate policy-governed Reward Token events

- [ ] 4.1 Emit idempotent onboarding, successful tenant-provider use, and eligible milestone events through the active versioned reward policy and existing RT ledger/outbox; verify tests cover duplicate delivery, ineligible and failed/site-served attempts, community context, and exactly-once awards.
- [ ] 4.2 Define and document the required initial reward amounts, eligibility/frequency limits, milestone thresholds, per-user quota thresholds, and usage-history retention before enabling the corresponding features; verify launch configuration rejects missing required policy values and retention behavior is covered by tests.

## 5. Roll out and validate end to end

- [ ] 5.1 Add a server-side BYO feature flag and operator guidance for staged provider enablement, secret rotation, disable/rollback, and credential deletion; verify the documented rollout and rollback commands match the deployment configuration and that disabling BYO routes requests through the site chain.
- [ ] 5.2 Run the complete relevant integration suite, `npm test`, `npm run build`, and `openspec validate "multi-tenant-ai-byo-keys" --strict`; verify all checks pass before enabling BYO routing broadly.
