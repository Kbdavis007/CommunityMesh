# Proposal

## Why

CommunityMesh currently has an application shell but no AI setup experience, so members cannot easily connect a provider they control or understand how it will be used. A friendly, guided wizard can make that setup approachable while reusing the shared provider, routing, and Reward Token policies rather than introducing a second credential or inference system.

## What Changes

- Add a five-step, accessible AI setup wizard: choose a provider, open its account page with a simple checklist, enter a “magic key,” test the AI, and review how CommunityMesh will use it.
- Offer the three requested choices—Groq, Gemini, and OpenRouter—with plain-language descriptions; allow a member to name their AI buddy and optionally play a provider comparison mini-game based only on verified provider capabilities.
- Validate submitted credentials through the trusted provider profile service, give friendly actionable feedback, and never show the submitted secret again after submission.
- Test the configured provider through the shared AI routing contract, display a successful result or an explicit helpful failure, and explain that CommunityMesh may use its own AI when the member's provider cannot serve a request.
- Provide an “Always use my AI when possible” preference, defaulting to on, while leaving final routing eligibility and platform safety policy authoritative.
- Publish onboarding and reward events to `ai_user_setup_queue` and `ai_user_rewards_queue` for idempotent boss-worker validation, activation, and policy-authorized awards. Keep credentials out of queue messages.
- Celebrate the configured onboarding reward in the UI when confirmed by the active reward policy. The requested 10 RT is the intended initial award only when that policy authorizes it; multiple-provider bonuses are also policy-defined and must not be independently minted by the wizard.
- Add concise, plain-language help and progress feedback, with keyboard and screen-reader support, large touch targets, and reduced-motion behavior.

## Capabilities

### New Capabilities

- `ai-provider-onboarding`: Guided, secure member onboarding for supported personal AI providers, including provider selection, credential validation, test inference, member preferences, and policy-confirmed onboarding feedback.

### Modified Capabilities

None. There are no canonical capability specs under `openspec/specs/`; the related BYO profiles, routing, and reward requirements exist in in-progress change deltas and must be integrated rather than duplicated.

## Impact

- **Web application:** `src/app/routes.tsx` currently contains placeholder pages and route navigation; add an entry point and wizard experience with focused route/component tests. `src/style.css` currently only defines global defaults.
- **Worker and provider integration:** `src/worker/index.ts` currently serves only health checks. The wizard must use the authenticated profile-validation and shared AI-routing contracts from the in-progress BYO and router changes, not expose provider API calls or secrets to the browser.
- **Queues and rewards:** `wrangler.jsonc` currently has D1 and Workers AI bindings but no queue bindings. Queue provisioning, safe event schemas, retry/idempotency handling, and boss-worker integration must be coordinated with backend work. Reward amounts and eligibility remain governed by the active versioned community policy and existing RT ledger.
- **Related OpenSpec changes:** Coordinate with `multi-tenant-ai-byo-keys`, `multi-provider-ai-router`, `ai-routing-provider-health`, `groq-ai-integration`, and `communitymesh-dao-platform`. In particular, reconcile the wizard's 10-RT onboarding expectation and multiple-provider bonus with the BYO change's requirement that reward amounts come from published policy.
