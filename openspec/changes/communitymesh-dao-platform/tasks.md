# Tasks

## 1. Provider and Project Foundations

- [x] 1.1 Verify current Cloudflare and Supabase payment-method requirements, free-tier quotas, and Cloudflare AI model availability for the intended deployment; record dated sources in deployment notes and stop for a user decision if a required service cannot meet the no-payment constraint.
- [x] 1.2 Scaffold the React/Vite/TypeScript client with Tailwind CSS, an installable PWA manifest, versioned service-worker app-shell caching, and build/lint/test scripts; verify installation metadata, offline shell startup, and a production build.
- [x] 1.3 Scaffold the Cloudflare Worker API with typed environment bindings, local development configuration, and a versioned health route; verify the route with a Worker test.
- [x] 1.4 Define the route map and component hierarchy for home, local hub, listing search/detail/create, profile, contributor tasks, governance, and AI activity; verify route navigation and not-found behavior in client tests and document the hierarchy.

## 2. Persistence and Data Contracts

- [x] 2.1 Add versioned Supabase SQL migrations for profiles, communities, membership, the six listing categories, listing images, tasks, and the task-completion outbox; verify migrations apply cleanly and constraints/search indexes with database tests.
- [x] 2.2 Add versioned D1 migrations for proposals, private ballots and VT snapshots, governance execution history, versioned community policy, CC/WC balances, RT/VT balances in configured integer subunits, cumulative earned-RT milestones, RT mint/transfer/redemption ledger entries, and AI run logs; verify non-negative balances, policy-version constraints, idempotency, and indexes with D1 migration tests.
- [x] 2.3 Document schema ownership, migration commands, the `r2_assets` bucket and required Cloudflare bindings, and Supabase configuration; verify setup steps against a clean development environment.
- [x] 2.4 Add versioned IndexedDB schemas for scoped cached records, account-partitioned pending operations, per-source sync cursors, unresolved conflicts, and asset-cache metadata; verify transactional writes, schema upgrade, and storage-failure behavior in browser tests.
- [ ] 2.5 Add version/revision metadata, per-store incremental change feeds, and deletion tombstones for synchronized Supabase and D1 records; verify cursor pagination returns changes without gaps or duplicate application.
- [ ] 2.6 Add a versioned Supabase asset-metadata migration for `r2_key`, `cdn_url`, and `cache_version`, and configure the `r2_assets` bucket and Worker binding; verify migration, metadata constraints, and binding configuration in a clean development environment.

## 3. Identity and Listing Services

- [ ] 3.1 Implement Worker-mediated Supabase Auth flows, secure HttpOnly session cookies, community-scoped member/Admin roles, and deployment-configured initial Admin assignment; verify unauthorized or cross-community Admin requests fail and tokens are absent from browser-managed record storage.
- [ ] 3.2 Implement profile read/update and privacy-filtered trust activity endpoints; verify private fields are omitted for other members and profile tests pass.
- [ ] 3.3 Implement listing create/edit/archive, community-scoped full-text search and category filters for all six categories; verify validation, ownership, active-state, and cross-community isolation cases with API tests.
- [ ] 3.4 Implement authorized short-lived upload URLs at `POST /r2/upload-url` and asset retrieval at `GET /r2/file/:id` and `GET /r2/image/:id`, associating listing images and other public assets with Supabase metadata; verify type, size, ownership, visibility, and expiry checks in API tests.
- [ ] 3.5 Document the versioned identity, listing, and asset API contracts; verify each documented request and response against the API tests.
- [ ] 3.6 Implement authenticated Worker sync endpoints for idempotent local-operation submission, incremental downloads, per-store cursors, tombstones, and revision-based conflict detection; verify interrupted retries do not duplicate accepted writes and unauthorized operations are rejected.
- [ ] 3.7 Document the sync protocol, cursor acknowledgment rules, operation idempotency, and conflict response contract; verify examples against sync endpoint tests.

## 4. Community Web Workflows

- [ ] 4.1 Build the shared responsive application shell, accessible navigation, and local-hub selection for supported ZIP/city entries; verify keyboard navigation, narrow viewport layout, and unsupported-location behavior.
- [ ] 4.2 Build listing search, filters, detail, create/edit, image, and temporary-hold/appeal views; verify loading, empty, success, and error states with component or browser tests.
- [ ] 4.3 Build member profile and reputation views with privacy-aware fields and activity explanations; verify profile visibility behavior with UI tests.
- [ ] 4.4 Document route behavior, PWA installation, offline route-shell and public-image behavior, and local development commands; verify the guide matches route and service-worker tests.
- [ ] 4.5 Make feature repositories render from IndexedDB first, cache eligible public CDN images in the service worker, track asset metadata and `cache_version` in IndexedDB, invalidate stale images, and coordinate background sync with startup, foreground, and connectivity-triggered retries; verify offline image reuse, version refresh, and exclusion of protected media in browser tests.
- [ ] 4.6 Queue offline listing create/edit/archive, own-profile edits, and task-completion evidence while keeping task claims and votes online-only; verify pending states, reconnect submission, and session-expiry handling in browser/API tests.
- [ ] 4.7 Build member-facing same-field conflict resolution that preserves both versions and resubmits against the latest revision; verify overlapping and non-overlapping multi-device edit scenarios in UI tests.

## 5. DAO Governance

- [ ] 5.1 Implement proposal creation and voting with snapshotted eligible members' VT balances and total VT supply, one private ballot per member, and immutable proposal-open voting weight; verify duplicate, late, zero-weight, and ineligible ballots are rejected by D1-backed tests.
- [ ] 5.2 Implement quorum and approval tallying against snapshotted VT supply and weighted ballots, public aggregate history, and an allowlisted idempotent execution registry; verify pass, fail, unsupported-action, and repeated-execution scenarios.
- [ ] 5.3 Build proposal, weighted voting, outcome, and governance-history views with AI summaries clearly marked as advisory; verify displayed VT weight, one-ballot-per-member behavior, and aggregate-only public results in UI/API integration tests.
- [ ] 5.4 Document governance eligibility, VT conversion and snapshot rules, weighted threshold configuration, execution handlers, and operational review; verify examples match the implemented governance tests.
- [ ] 5.5 Build a community Admin policy editor for reward actions, eligibility/frequency limits, RT-to-VT conversion, perk prices, and governance thresholds; verify all values are editable, validated, community-scoped, and submitted as proposals rather than activated directly.
- [ ] 5.6 Implement community-vote approval and version activation for policy proposals; verify pending, rejected, and invalid proposals leave active configuration unchanged, while passed proposals activate atomically under the rules that were active when voting opened.
- [ ] 5.7 Implement community-governed Admin role grants and revocations after deployment bootstrap; verify no Admin can directly grant or revoke roles without an approved governance action.

## 6. Contributor Tasks and Credits

- [ ] 6.1 Implement task discovery, atomic claim, evidence submission, reviewer decision, and task status transitions; verify concurrent claims and rejected/approved completion paths with database-backed tests.
- [ ] 6.2 Implement transactional Supabase completion-outbox delivery to the D1 ledger, separate CC/WC/RT/VT balances, task reward minting, compensating adjustments, and scheduled reconciliation; verify retries and injected delivery failures produce at most one award.
- [ ] 6.3 Build contributor task and credit-history views with distinct non-monetary balances and pending award state; verify award status and history rendering with UI/API integration tests.
- [ ] 6.4 Document task review, award configuration, outbox recovery, and ledger reconciliation; verify the documented recovery procedure against a simulated failed delivery.
- [ ] 6.5 Inventory supported member action events and implement versioned, community-configured reward rules and RT-to-VT conversion; verify action coverage, configurable amounts/limits/ratios, conversion boundaries, idempotency, and rejection of unconfigured mint requests without relying on source-code economic constants.
- [ ] 6.6 Implement atomic same-community RT transfers and non-cash in-app perk redemption with ledger history; verify insufficient-balance and cross-community requests fail, retries do not duplicate entries, and transfers conserve total supply.
- [ ] 6.7 Build separate CC/WC/RT/VT balances, reward history, RT transfer and perk redemption views, and voting-token eligibility information; verify published amounts, pending/confirmed states, and rejected operations in UI/API tests.
- [ ] 6.8 Document ledger-unit precision/versioning, RT mint authorization and configurable reward rules, VT conversion policy, transfer limits, perk terms, and correction procedures; verify documented flows against ledger tests and confirm no external blockchain integration is required.

## 7. Scheduled AI Operations

- [ ] 7.1 Implement per-agent model configuration, quota/time/batch limits, failure logging, and disabled/degraded behavior when a model is unavailable; verify no paid fallback is invoked and non-AI workflows remain available.
- [ ] 7.2 Implement `ai_moderator` temporary high-confidence holds, human review, release/uphold decisions, and owner appeals; verify below-threshold results do not auto-hold and AI cannot permanently remove content.
- [ ] 7.3 Implement `ai_curator` and `ai_summarizer` schedules with advisory results linked to source content; verify outputs are labeled and do not hide eligible listings or replace proposal text.
- [ ] 7.4 Implement `ai_task_dispatcher` and `ai_maintenance` schedules with source-finding deduplication and review-only operational findings; verify repeated runs do not duplicate open tasks or mutate policy/configuration.
- [ ] 7.5 Add the five named Cron Triggers and structured D1 run records, then build the public AI activity view with sensitive fields excluded; verify schedule registration, success/failure visibility, and log privacy.
- [ ] 7.6 Document model verification, per-agent permissions, schedules, quotas, and degraded-mode operations; verify the documented model IDs and schedules match deployment configuration.

## 8. Deployment and End-to-End Verification

- [ ] 8.1 Configure staging Pages, Worker routes, D1 and R2 bindings including `r2_assets`, Supabase Auth/Storage, secrets, CORS, bootstrap Admin assignments, and complete initial community policy values; verify staging contains no source-coded economic defaults and uses no unapproved paid service.
- [ ] 8.2 Run end-to-end tests for signup, community-scoped listing search, listing moderation appeal, public asset upload/retrieval and migration without broken references, Supabase profile-image proxy authorization, CDN cache policy and version invalidation, task completion and credit reconciliation, configured RT rewards and VT conversion, Admin policy proposal/approval/rejection, RT transfer and perk redemption, weighted proposal voting/execution, AI run visibility, offline app launch/local reads and public-image reuse, bidirectional sync/retry, storage failure, and multi-device conflict resolution; verify supported-browser behavior, desktop/mobile layout, and keyboard accessibility.
- [ ] 8.3 Complete operator documentation for Cloudflare Pages/Workers/R2, Supabase setup, asset migration, schema deployment, AI configuration, backups/exports, quota monitoring, and rollback; verify each setup and rollback command in staging.
- [ ] 8.4 Build a deployment-operator-only provider-usage dashboard, separate from community Admin roles, with timestamped Cloudflare and Supabase quota snapshots, 70/80/90% configurable alerts, and stale/unavailable states; verify provider credentials stay server-side, private data is excluded, and quota exhaustion is visible without exposing billing data publicly.