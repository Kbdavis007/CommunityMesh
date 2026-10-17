# Tasks

## 1. Reconcile service contracts and queue infrastructure

- [ ] 1.1 Agree on the authenticated profile, setup-status, shared test-inference, preference, and reward-result contracts with `multi-tenant-ai-byo-keys`, `multi-provider-ai-router`, and `communitymesh-dao-platform`; document ownership and deployment prerequisites and verify contract tests reject unsupported providers and cross-member access.
- [ ] 1.2 Provision `ai_user_setup_queue` and `ai_user_rewards_queue`, add Worker/boss-worker bindings and consumers, and document event schemas; verify queue tests cover retries, idempotency, owner/profile references, and prove raw credentials never enter queued payloads.

## 2. Add the wizard route and accessible flow shell

- [ ] 2.1 Add an `/ai-setup` route and an application navigation entry, then implement the five-step progress shell and responsive accessible controls; verify route tests cover entry, step navigation, progress announcements, keyboard use, and reduced-motion behavior.
- [ ] 2.2 Add the optional “Help me” content and plain-language step guidance; verify focused UI tests can open help from each step and close it without losing non-secret progress.

## 3. Implement provider choice and personalization

- [ ] 3.1 Render only registry-enabled Groq, Gemini, and OpenRouter choices with approved descriptions and official signup destinations; verify tests cover disabled providers and reject arbitrary account URLs.
- [ ] 3.2 Add the account checklist, optional capability-based comparison mini-game, and AI buddy display name; verify tests cover skipping the game, metadata-only comparisons, and member-scoped name persistence.

## 4. Connect credential setup to the trusted profile service

- [ ] 4.1 Add the “magic key” input and authenticated profile submission/status flow, clearing the input after every submission and displaying pending, validated, invalid, unavailable, and retry outcomes; verify integration tests cover each response without persisting or exposing the secret.
- [ ] 4.2 Connect setup progress to the queued boss-worker lifecycle and authoritative saved profile state; verify tests cover retry-safe activation, recovery after worker failure, profile masking, and secret-free logs and queue messages.

## 5. Connect test inference and provider preference

- [ ] 5.1 Add the “Try my AI” test using the shared routing contract and requested CommunityMesh prompt; verify tests cover an own-provider success, site fallback, unavailable response, actual-provider attribution, and blocking unvalidated profiles.
- [ ] 5.2 Add the final routing explanation and member-scoped “Always use my AI when possible” preference defaulting to on for unset profiles; verify tests cover default, persistence, updates, and that platform routing policy remains authoritative.

## 6. Connect policy-authorized rewards

- [ ] 6.1 Emit idempotent onboarding and multi-provider reward events after the qualifying flow outcomes, consume only confirmed policy/ledger results, and document the active policy prerequisites; verify tests cover the 10 RT onboarding policy, configured multi-provider bonus, no active award policy, ledger rejection, and duplicate delivery.

## 7. Verify end-to-end behavior and rollout

- [ ] 7.1 Run targeted wizard and Worker integration tests plus `npm test`, `npm run lint`, `npm run build`, and `openspec validate "ai-provider-setup-wizard" --strict`; verify all checks pass and record any environment-dependent queue integration checks.
- [ ] 7.2 Document staged enablement, queue and policy prerequisites, secret-safe troubleshooting, and rollback; verify the documented rollout disables new onboarding without misreporting pending profiles or reversing confirmed rewards.
