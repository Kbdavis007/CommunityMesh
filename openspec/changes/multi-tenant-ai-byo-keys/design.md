# Design

## Context

See `proposal.md` for motivation. The Worker currently serves only a health route, `wrangler.jsonc` binds D1 and Workers AI, and the repository has no implemented AI provider route or tenant-key storage. The in-progress router change proposes a single authenticated routing boundary; the existing D1 governance ledger stores community-scoped Reward Token balances and idempotent ledger entries. The requirements are in `specs/ai-tenant-profiles/spec.md` and `specs/ai-tenant-routing/spec.md`.

## Goals / Non-Goals

**Goals:**
- Keep provider credentials inaccessible to browser code, other tenants, operational logs, and AI usage records.
- Make tenant-provider selection, site fallback, usage reservation, and reward processing compose with the shared router and token policy.
- Support different provider capabilities without implying every provider can serve every AI task.

**Non-Goals:**
- Create a second AI inference endpoint or replace the site's provider registry and global routing policy.
- Guarantee that a user provider is available, free, or eligible for every task.
- Define fixed provider quota values, usage prices, Reward Token amounts, or milestone thresholds in code.

## Decisions

### Store one tenant profile per authenticated user and encrypt provider credentials

Use the requested `ai_tenant_profile` D1 record keyed by the authenticated user ID, with `providers` represented as validated provider configurations and `active` controlling whether the profile participates in routing. Store each credential as authenticated ciphertext plus its random nonce and encryption-key version; never store a plaintext key, even temporarily in logs or profile responses. Add update metadata as needed for safe replacement and rotation. Bind ciphertext to the owner ID and provider ID as authenticated encryption data so copied or altered records cannot be used under another identity or provider.

Use a high-entropy Worker secret as the root encryption key and Web Crypto AES-GCM for credential encryption/decryption; derive or select versioned keys on the server and keep key material out of D1 and client bundles. A Worker secret is chosen over browser encryption because routing must be able to use the key server-side, and over storing keys as ordinary D1 strings because a database read would otherwise disclose every credential. Provision and rotate the secret through the deployment secret-management process; never put its value in repository configuration. Reject activation when the key version cannot be decrypted. Credential validation calls must be server-side and must not include submitted keys in error text.

### Keep profile operations behind the authenticated Worker boundary

Add profile management to the shared authenticated Worker API. Derive `user_id` only from the validated Supabase identity, authorize every read and mutation against that identity, and return only provider names, masked/non-secret metadata, validation state, and activation state. Do not accept custom base URLs or arbitrary provider identifiers in a way that could turn a user configuration into server-side request forgery; provider endpoints and protocol details come from the trusted adapter registry.

Validate credentials with the provider's least-privileged supported verification operation and mark them usable only after successful validation. A provider outage during validation is a distinct non-validated result, not success. Updating a credential replaces the prior encrypted value atomically; removal makes it unavailable to routing and deletes its ciphertext.

### Extend the shared router with a tenant-first preflight

After authentication and shared request validation, resolve the member's active profile and filter its validated providers by registered task capability, model/context constraints, platform policy, and request budget. Attempt eligible providers in the member's deterministic configured order. If there are none, continue directly through the site's configured chain. If an attempt reports quota exhaustion, fails, times out, or returns invalid output, record the outcome and move to the next eligible tenant provider or the site's chain, respecting the shared route's total deadline and retry cap. The shared router remains responsible for task validation, output normalization, moderation boundaries, and final unavailable outcomes.

Provider adapters for Groq, OpenRouter, Gemini Flash, Cohere, Fal.ai, Together AI, and HuggingFace must declare capabilities and normalize provider-specific quota, error, and usage signals into the shared contract. Do not assume equivalent quota APIs or identical model capabilities; treat unknown usage as unavailable rather than inventing token counts. When shared site-side limits also prevent fallback, return the existing explicit unavailable outcome instead of bypassing the limit.

### Record usage and reservations in shared D1 accounting

Use `ai_tenant_usage` for per-attempt attribution and measured usage, with a stable request/attempt identifier, user ID, provider/model identifiers, outcome, available token counts, latency, and timestamp. Index by user/time and user/provider/time for quota windows and account history. Do not store prompts, response bodies, API keys, or provider request headers.

Quota checks must use the shared router's atomic reservation/accounting mechanism, extended for tenant budgets, rather than a separate read-then-write check that races under concurrent requests. Reserve a bounded estimated amount before dispatch, settle it with provider-reported usage when available, and release unused reservation on failure. Coordinate schema ownership with the in-progress router and provider-health changes so the system has one source of truth for request attempts and budget reservations rather than duplicate ledgers.

### Integrate rewards through the existing policy and ledger

Treat onboarding, successful tenant-served inference, and configured usage milestones as source events for the existing versioned community reward policy. A BYO award is created only when that policy authorizes it; amount, frequency limit, eligible usage definition, and threshold remain policy data. Persist a stable source-event identifier and process the award idempotently through the existing RT ledger/outbox pattern so retries cannot mint twice.

Tenant profiles and usage are account-scoped; the existing token ledger is community-scoped. Associate a reward event only with the relevant authenticated community context and active policy. Onboarding can earn at most once per member and must use the member's selected eligible community context; if no eligible context or policy exists, save the profile without an award. Successful-use rewards require a completed tenant-provider attempt; using only site fallback does not qualify. Milestone progress counts only usage events defined as eligible by the active policy, not failed attempts or site-served requests.

### Roll out additively and make BYO disableable

Deploy schema and encryption-key support before enabling profile writes. Keep BYO routing behind a server-side feature flag while validating adapters and accounting. Enable profile management first, then a limited set of providers and traffic, then the full supported set after quota/fallback behavior is observed. A rollback disables tenant reads/dispatch and routes eligible requests through the site chain; it does not delete encrypted profiles or historical usage. Credential deletion and key retirement use an explicit migration/rotation process rather than a code rollback.

## Risks / Trade-offs

- [Worker encryption-key compromise exposes decryptable tenant credentials] → Keep the high-entropy key in deployment secrets, restrict access and rotation, bind ciphertext to user/provider identity, and never emit credentials in logs or responses.
- [Provider-specific validation and quota semantics differ or change] → Isolate adapters, keep unknown usage unknown, bound all calls, test provider contract failures, and refresh provider metadata during implementation.
- [A tenant provider may be slower or fail after a request has begun] → Enforce one end-to-end deadline and bounded retries; do not restart a request indefinitely or hide an unavailable result as success.
- [Usage reservations can become stale after Worker interruption] → Use reservation expiry and idempotent settlement/release in the shared accounting path; reconcile expired reservations without logging request payloads.
- [Rewards may be duplicated or gamed through retries and low-value requests] → Apply active policy eligibility/frequency limits and stable unique source-event IDs; do not reward failed or site-served attempts as tenant usage.
- [Combining account-scoped profiles with community-scoped RT awards is ambiguous] → Require an explicit eligible community context for every award and award onboarding once, as described in the decision above.
- [Several in-progress AI changes touch routing and usage contracts] → Reconcile their endpoint, adapter, and accounting requirements before implementation; do not ship competing routes or duplicate usage tables.

## Migration Plan

1. Reconcile the change with the shared router and reward-ledger changes; settle one request/attempt accounting contract and the production encryption-key provisioning procedure.
2. Additive D1 migration creates the tenant profile and usage structures, indices, and any shared reservation/outbox extensions. Apply it without changing existing profile or token rows.
3. Provision the versioned encryption secret in each environment and test encrypted write/read, owner binding, rotation, and decryption failure behavior before enabling tenant profiles.
4. Deploy profile operations and provider validation with BYO routing disabled. Verify that no plaintext credential appears in API responses, traces, logs, or D1.
5. Enable routing behind a server-side flag, first for a small provider set and then all supported adapters. Observe provider attempts, fallback outcomes, usage reconciliation, and idempotent reward processing before broad enablement.
6. To roll back, disable tenant-provider selection and continue through the existing site router. Keep stored ciphertext and usage for a defined operational retention period; remove profiles only through the user's delete action or a separately reviewed data-retention process.

## Open Questions

- Product operators must publish initial onboarding, successful-use, and milestone Reward Token policy values and frequency limits before rewards are enabled; no value is assumed by this design.
- The exact user-facing usage-history retention period and provider-specific per-member quota thresholds need operational policy values before launch. These values do not change the routing or storage boundaries in this design.
