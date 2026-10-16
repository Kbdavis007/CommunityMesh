# Tasks

## 1. Verify provider readiness and establish chat foundations

- [ ] 1.1 Verify the selected Stream Maker account's quotas, AI Moderation availability, community/proposal policy controls, webhook behavior, and channel limits; record a dated result and deployment limits in `docs/provider-service-limits.md`, and keep affected chat scopes disabled if a required policy control is unavailable.
- [ ] 1.2 Add the Stream client/server and Supabase Auth integration dependencies and server-only Worker secret bindings; verify installation and `npm run build`, and confirm production client assets contain no privileged Stream or Supabase credentials.
- [ ] 1.3 Connect chat routes to an authenticated Supabase session and sign-out lifecycle; verify tests show unauthenticated routes request authentication and sign-out closes the client and clears its session.

## 2. Implement Worker authorization and channel provisioning

- [ ] 2.1 Add authenticated Worker endpoints for chat session/token issuance and channel authorization/provisioning; verify tests reject invalid sessions, inactive members, and unauthorized resources without returning privileged credentials.
- [ ] 2.2 Enforce active-community, proposal-community, assigned-task, and mutually authorized DM membership rules, including canonical DM channel identities and revoked-member reconciliation; verify focused tests cover each channel type and access denial.
- [ ] 2.3 Restrict Stream client permissions so clients can send and interact only in Worker-provisioned channels and cannot create channels, add members, or change moderation policy; verify integration tests reject those client-side mutations.
- [ ] 2.4 Document the chat Worker API, authentication errors, token lifecycle, and channel eligibility in `docs/application-routes.md`; verify documented routes match the implemented endpoints.

## 3. Add moderation policy, webhook audit, and administration

- [ ] 3.1 Add D1 migrations and schema tests for moderation policy, verified events, and administrative overrides, with unique provider-event identity and no message-body storage; verify the migration applies and duplicate event identifiers are constrained.
- [ ] 3.2 Implement signed Stream webhook validation, event deduplication, moderation-state enforcement, and failure handling without invoking Cloudflare AI; verify tests cover valid, invalid, duplicate, delayed, and unavailable moderation events.
- [ ] 3.3 Implement Admin-only review and override operations and the moderation dashboard, including actor and prior/new decision audit records; verify non-Admin denial and successful override tests.
- [ ] 3.4 Configure community thresholds and stricter proposal rules using only verified Stream-supported controls; verify saved policy is scoped correctly and the feature remains disabled when account capability checks fail.
- [ ] 3.5 Document moderation actions, policy configuration, audit retention, and the provider-capability rollout gate; verify the operational guide distinguishes Stream decisions from human overrides.

## 4. Build real-time chat experiences

- [ ] 4.1 Add the authenticated Stream chat provider and headless chat views for `/hub/chat`, `/governance/proposal/:proposalId/chat`, `/tasks/:taskId/chat`, and `/messages/:memberId`; verify route tests cover authorized setup, token failure, and unauthorized channel handling.
- [ ] 4.2 Implement message composition, history, typing indicators, read receipts, threads, reactions, attachments, and explicit loading/error states with CommunityMesh styles; verify component tests cover interactions, configured size/type limits, and provider rate-limit fallback.
- [ ] 4.3 Render flagged, blocked, shadow-blocked, and quarantined states correctly for sender, ordinary participant, and Admin; verify moderation UI tests check visibility, warning, rejection toast, and pending-review placeholder behavior.
- [ ] 4.4 Update `docs/application-routes.md` with chat routes and access behavior; verify every delivered chat route and its authentication boundary appears in the route documentation.

## 5. Add private offline history and synchronization

- [ ] 5.1 Implement versioned member- and channel-scoped IndexedDB message and cursor stores; verify tests cover schema upgrade, account scoping, sign-out cleanup, and monotonic cursor updates.
- [ ] 5.2 Synchronize incremental history at startup, foregrounding, and online events, caching only content visible to the current member and preserving moderation metadata; verify tests cover flagged, quarantined, shadow-blocked, and approved message persistence.
- [ ] 5.3 Provide read-only cached history while offline and prevent queued or success-shaped offline sends; verify offline tests show cached content, a live-unavailable status, and no locally queued message.
- [ ] 5.4 Document local chat retention, cache clearing, and offline limitations; verify the documentation matches the implemented IndexedDB and service-worker boundaries.

## 6. Validate staged rollout and operational fallback

- [ ] 6.1 Add independently controllable rollout stages for community, proposal, task, and DM chat in that order; verify tests show later channel types remain disabled until their stage is enabled.
- [ ] 6.2 Run focused end-to-end checks for authorization, moderation, Admin overrides, offline history, and provider quota/token failure; verify each failure returns an explicit error or read-only fallback without changing governance eligibility.
- [ ] 6.3 Record deployment and rollback procedures, monitoring, retention, and dated quota checks in the operational documentation; verify an operator can disable chat/token issuance without changing identity or governance data.
