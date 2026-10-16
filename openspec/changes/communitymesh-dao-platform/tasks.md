# Tasks

## 1. Provider and Project Foundations

- [ ] 1.1 Verify current Cloudflare and Supabase payment-method requirements, free-tier quotas, and Cloudflare AI model availability for the intended deployment; record dated sources in deployment notes and stop for a user decision if a required service cannot meet the no-payment constraint.
- [ ] 1.2 Scaffold the React/Vite/TypeScript client with Tailwind CSS and build, lint, and test scripts; verify dependency installation and a production build.
- [ ] 1.3 Scaffold the Cloudflare Worker API with typed environment bindings, local development configuration, and a versioned health route; verify the route with a Worker test.
- [ ] 1.4 Define the route map and component hierarchy for home, local hub, listing search/detail/create, profile, contributor tasks, governance, and AI activity; verify route navigation and not-found behavior in client tests and document the hierarchy.

## 2. Persistence and Data Contracts

- [ ] 2.1 Add versioned Supabase SQL migrations for profiles, communities, membership, the six listing categories, listing images, tasks, and the task-completion outbox; verify migrations apply cleanly and constraints/search indexes with database tests.
- [ ] 2.2 Add versioned D1 migrations for proposals, private votes, governance execution history, CC/WC/DT ledger and balances, and AI run logs; verify constraints, uniqueness, and indexes with D1 migration tests.
- [ ] 2.3 Document schema ownership, migration commands, required Cloudflare bindings, and Supabase configuration; verify setup steps against a clean development environment.

## 3. Identity and Listing Services

- [ ] 3.1 Implement Worker-mediated Supabase Auth flows and access-token verification with role and community authorization; verify unauthenticated requests fail and valid member requests pass API tests.
- [ ] 3.2 Implement profile read/update and privacy-filtered trust activity endpoints; verify private fields are omitted for other members and profile tests pass.
- [ ] 3.3 Implement listing create/edit/archive, community-scoped full-text search and category filters for all six categories; verify validation, ownership, active-state, and cross-community isolation cases with API tests.
- [ ] 3.4 Implement authorized image upload and listing image association with configured type and size limits; verify invalid and unauthorized uploads are rejected and document the upload flow.
- [ ] 3.5 Document the versioned identity and listing API contracts; verify each documented request and response against the API tests.

## 4. Community Web Workflows

- [ ] 4.1 Build the shared responsive application shell, accessible navigation, and local-hub selection for supported ZIP/city entries; verify keyboard navigation, narrow viewport layout, and unsupported-location behavior.
- [ ] 4.2 Build listing search, filters, detail, create/edit, image, and temporary-hold/appeal views; verify loading, empty, success, and error states with component or browser tests.
- [ ] 4.3 Build member profile and reputation views with privacy-aware fields and activity explanations; verify profile visibility behavior with UI tests.
- [ ] 4.4 Document route behavior and local development commands; verify the route guide matches the implemented route tests.

## 5. DAO Governance

- [ ] 5.1 Implement proposal creation and voting with a snapshotted eligible electorate and rule values, one account per vote, and private ballot records; verify duplicate, late, and ineligible votes are rejected by D1-backed tests.
- [ ] 5.2 Implement quorum and approval tallying, public aggregate history, and an allowlisted idempotent execution registry; verify pass, fail, unsupported-action, and repeated-execution scenarios.
- [ ] 5.3 Build proposal, voting, outcome, and governance-history views with AI summaries clearly marked as advisory; verify one-member-one-vote behavior and aggregate-only public display in UI/API integration tests.
- [ ] 5.4 Document governance eligibility, threshold configuration, execution handlers, and operational review; verify examples match the implemented governance tests.

## 6. Contributor Tasks and Credits

- [ ] 6.1 Implement task discovery, atomic claim, evidence submission, reviewer decision, and task status transitions; verify concurrent claims and rejected/approved completion paths with database-backed tests.
- [ ] 6.2 Implement transactional Supabase completion-outbox delivery to the D1 credit ledger, separate CC/WC/DT balances, published award rules, compensating adjustments, and scheduled reconciliation; verify retries and injected delivery failures produce at most one award.
- [ ] 6.3 Build contributor task and credit-history views with distinct non-monetary balances and pending award state; verify award status and history rendering with UI/API integration tests.
- [ ] 6.4 Document task review, award configuration, outbox recovery, and ledger reconciliation; verify the documented recovery procedure against a simulated failed delivery.

## 7. Scheduled AI Operations

- [ ] 7.1 Implement per-agent model configuration, quota/time/batch limits, failure logging, and disabled/degraded behavior when a model is unavailable; verify no paid fallback is invoked and non-AI workflows remain available.
- [ ] 7.2 Implement `ai_moderator` temporary high-confidence holds, human review, release/uphold decisions, and owner appeals; verify below-threshold results do not auto-hold and AI cannot permanently remove content.
- [ ] 7.3 Implement `ai_curator` and `ai_summarizer` schedules with advisory results linked to source content; verify outputs are labeled and do not hide eligible listings or replace proposal text.
- [ ] 7.4 Implement `ai_task_dispatcher` and `ai_maintenance` schedules with source-finding deduplication and review-only operational findings; verify repeated runs do not duplicate open tasks or mutate policy/configuration.
- [ ] 7.5 Add the five named Cron Triggers and structured D1 run records, then build the public AI activity view with sensitive fields excluded; verify schedule registration, success/failure visibility, and log privacy.
- [ ] 7.6 Document model verification, per-agent permissions, schedules, quotas, and degraded-mode operations; verify the documented model IDs and schedules match deployment configuration.

## 8. Deployment and End-to-End Verification

- [ ] 8.1 Configure staging Pages, Worker routes, D1 bindings, Supabase Auth/Storage, secrets, CORS, and initial community, governance, credit, and schedule values; verify a staging deployment uses no unapproved paid service.
- [ ] 8.2 Run end-to-end tests for signup, community-scoped listing search, listing moderation appeal, task completion and credit reconciliation, proposal voting/execution, and AI run visibility; verify desktop/mobile layout and keyboard accessibility.
- [ ] 8.3 Complete operator documentation for Cloudflare Pages/Workers, Supabase setup, schema deployment, AI configuration, backups/exports, quota monitoring, and rollback; verify each setup and rollback command in staging.