# Design

## Context

See [proposal.md](./proposal.md) for the motivation and [specs/ai-provider-onboarding/spec.md](./specs/ai-provider-onboarding/spec.md) for the externally observable requirements. The current React application has placeholder routes and no setup UI. The Worker exposes only a health endpoint; `wrangler.jsonc` binds D1 and Workers AI but has no queue bindings. Related in-progress changes define the authenticated provider profile service, shared routing boundary, and versioned reward ledger. This change must consume those contracts rather than create competing ones.

## Goals / Non-Goals

**Goals:**

- Keep the setup flow understandable and usable across device sizes and assistive technologies.
- Ensure the browser never becomes a credential store or direct provider client.
- Make validation, activation, test inference, and reward outcomes traceable to authoritative server-side state.
- Keep wizard presentation and queue event handling independent from provider-specific API formats.

**Non-Goals:**

- Implement provider adapters, encryption/key management, the shared AI router, or the RT ledger a second time.
- Let the wizard alter global provider eligibility, moderation, or routing policy.
- Promise provider pricing, speed, quality, or a reward amount when registry or active policy data does not confirm it.

## Decisions

### Add a focused React route and keep wizard-only state local

Add an `/ai-setup` route and expose it from existing application navigation. Build the flow from small step-oriented UI pieces using the repository's existing React, React Router, and Tailwind setup rather than adding a wizard library. Keep the current step, selected provider, account checklist, and comparison activity in component state; persist only non-secret resume metadata if necessary. The authenticated server profile remains authoritative for saved provider configuration and the preference. Never place a credential in local storage, IndexedDB, a URL, telemetry, or analytics.

**Alternative considered:** Put all flow state in a new global store. This adds infrastructure without a cross-page state requirement; account creation in another tab can preserve the current page state without it.

### Use one trusted provider registry for selection and comparison

Populate the cards, signup destinations, labels, and comparison activity from the trusted registry used by provider profile validation. The initial wizard may offer Groq, Gemini, and OpenRouter only when each is enabled there. Do not accept client-supplied signup URLs or use comparison-game claims that are not represented in verified provider metadata.

**Alternative considered:** Hard-code card data and signup links in the UI. That risks showing a provider or destination inconsistent with server-side support and creates an unsafe source for capability claims.

### Submit credentials to the profile service, then queue only a reference

On credential submission, send the value once over the authenticated profile-service request; do not call a provider from the browser. The server validates the supported provider, encrypts and stores the credential according to the BYO profile contract, and emits an `ai_user_setup_queue` event containing an idempotency key, authenticated owner reference, and profile reference—not the credential. The boss worker performs or completes provider validation and activation. The UI clears the input immediately after submission and reads only non-secret status from the profile service while processing is pending.

**Alternative considered:** Put the credential directly in a queue event for the worker. Queue payloads may be retried, inspected, or retained independently of profile storage; using a stable profile reference avoids multiplying secret copies and keeps queue ownership checks server-side.

Queue bindings and the boss-worker consumer are infrastructure prerequisites: the current Wrangler config has no queue declarations. Their names and event semantics must be reconciled with the BYO implementation before enabling the UI; no alternate local-only queue is introduced.

### Route the test through the shared inference contract

After the profile is server-confirmed as validated and active, invoke the shared AI routing endpoint using its supported test-task contract and the requested CommunityMesh sentence prompt. Render only its validated result and actual provider/outcome metadata. A site-managed fallback or unavailable result remains explicit; neither is represented as the member's provider succeeding.

**Alternative considered:** Call Groq, Gemini, or OpenRouter directly from the browser. This would expose credentials, fork provider-specific request handling, and bypass common routing and safety behavior.

### Make rewards an acknowledged, policy-driven side effect

After eligible setup and successful test completion, emit an idempotent reward event through `ai_user_rewards_queue`. The boss worker applies the active community policy and writes to the existing RT ledger; the UI displays the amount only after receiving its confirmed ledger outcome. The initial desired onboarding amount is 10 RT, and a multiple-provider bonus is supported only when an active policy defines it. If policy or ledger confirmation is absent, show no earned-token claim.

**Alternative considered:** Award tokens in the client or assume a fixed amount in the wizard. Both could bypass the existing community governance and create duplicate or unauthorized awards.

### Keep preference member-scoped and default-on

Initialize “Always use my AI when possible” to enabled only when the member has no saved preference, then save changes through the authenticated profile service. The shared router interprets the preference alongside its own task, health, safety, quota, and eligibility rules. The wizard does not attempt to pick a provider for future requests.

**Alternative considered:** Encode the preference in browser-only state. That would make the displayed setting disagree with routing behavior across sessions and devices.

## Risks / Trade-offs

- [The wizard change may be implemented before its BYO/router/reward contracts are available.] → Keep API boundaries explicit in tasks and coordinate contracts and deployment order; do not ship active setup against placeholder endpoints.
- [Queue delivery and provider validation can be delayed or repeated.] → Expose pending/failed/active states from authoritative profile status and use idempotent event identifiers for setup and rewards.
- [A failed network response may occur after a credential reached the server.] → Clear the input after every submission attempt; require re-entry for retry rather than retain the secret in browser state.
- [A reward policy may not authorize the requested 10 RT or multi-provider bonus.] → Treat policy configuration and ledger acknowledgment as prerequisites for showing a reward, and disclose the no-reward outcome plainly.
- [A provider comparison game can imply unverified superiority.] → Generate comparisons only from registry-backed capabilities and avoid unsupported rankings or guarantees.

## Migration Plan

1. Reconcile profile, router, queue, and reward event contracts with the in-progress BYO and shared-router changes; provision both named queues and their consumers.
2. Deploy the server-side authenticated profile, setup-status, preference, test-route, and reward-event integrations before exposing the wizard route.
3. Deploy the UI behind the existing BYO enablement control or an equivalent server-side feature flag. Keep setup unavailable when the required provider or queue contracts are not active.
4. Enable providers and policy-authorized rewards in stages; verify idempotency and secret redaction before broad rollout.
5. To roll back, disable the setup entry point and provider onboarding flag, stop new queue submissions, and leave already stored profiles and ledger events governed by the BYO and reward lifecycle controls. Do not delete credentials or reverse confirmed RT awards as an implicit UI rollback.
