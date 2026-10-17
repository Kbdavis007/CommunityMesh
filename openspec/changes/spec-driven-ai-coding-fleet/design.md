# Design

## Context

See proposal.md for the motivation and capability scope. The current Cloudflare Worker in `src/worker/index.ts` serves only a health route; it has no queue handlers. `worker-configuration.d.ts` declares D1 and Workers AI bindings, while `src/worker/env.d.ts` contains only optional Supabase bindings. There is no main OpenSpec capability inventory, and the existing AI routing and operations requirements are pending change deltas.

The queue and governance behavior is defined in the three delta specs: `coding-task-orchestration`, `coding-worker-execution`, and `coding-agent-governance`.

## Goals / Non-Goals

**Goals:**
- Implement queue-triggered request intake, normalization, specialized task execution, results, and alerts.
- Keep dispatch, lifecycle and provenance consistent across retries, duplicate delivery, overload reassignment, and multiple community hubs.
- Integrate OpenSpec validation and agent/skill guardrails with the existing Cloudflare Worker, D1, and AI-routing direction.
- Make deployment and rollback possible without requiring a destructive migration or allowing workers to write to the main branch.

**Non-Goals:**
- Add a direct HTTP endpoint that executes coding tasks.
- Allow worker-generated changes to merge automatically or write to the main branch.
- Define fixed quota thresholds, priority weights, token caps, or retention periods; make these deployment or hub policy configuration.
- Replace OpenSpec, the existing AI provider-routing direction, or human pull-request review.

## Decisions

### Queue topology and source of truth

Use the four named Cloudflare Queues as the sole task-delivery path: `coding_requests_queue` for intake, `coding_tasks_queue` for normalized assignments, `coding_results_queue` for terminal outcomes, and `coding_alerts_queue` for failures and operational conditions. UI, GitHub, and system integrations act as authorized queue producers; neither the boss nor specialized workers execute coding work from a direct HTTP request.

Use one Cloudflare consumer for `coding_tasks_queue` with a specialization registry that dispatches each message to exactly one logical worker handler (`feature_impl`, `refactor`, `test_writer`, `doc_writer`, or `bug_fix`). This preserves the required shared queue while avoiding independent consumers competing for messages intended for other specializations. A message that does not match a registered specialization is rejected and alerted, not silently acknowledged as successful.

Cloudflare Queues are at-least-once delivery, so each message carries a stable task identifier and assignment generation. D1 stores task lifecycle, idempotency/claim state, profile and skill version references, and audit records; it is the coordination and audit ledger, not an alternate task-ingestion or execution path. Workers verify the task identifier and current assignment generation in D1 before acting. Unique task identifiers, transactional state transitions, and stale-generation checks make duplicate or superseded messages safe.

### Boss assignment and overload reassignment

The boss queue consumer validates and normalizes requests, resolves the OpenSpec change/spec paths and approved profile/skill versions, checks quotas, and creates the D1 task record before publishing the normalized assignment. Persist an idempotency key derived from the producer's request identity so redelivery cannot create a second task.

Track task backlog and in-flight work by specialization in D1; the request consumer orders each received batch by descending priority, and deferred work is retried by priority before creation time. Active-task quotas are concurrent reservations configured by hub or platform for agent profile, user, and project; a missing policy imposes no limit. Reserve all applicable dimensions atomically in D1 before publishing, release reservations when a task is deferred or terminal, and retry deferred tasks from their D1-backed payload when capacity is available. If a profile is overloaded, assign only to another approved profile in the same hub scope that supports the same specialization; never move a task across hubs or bypass hub profile restrictions. Increment the task's assignment generation transactionally and make older queue messages ineligible. Evaluate worker outcomes against configured health-policy windows and failure thresholds, surface backlog/health alerts, and bound reassignment attempts with the specialization's `max_reassignments` policy. A five-minute scheduled monitor retries eligible deferred work and evaluates backlog, failure-rate, and stale-attempt policies.

### D1 records and hub-scoped configuration

Add additive D1 tables for coding tasks, active request payloads, task attempts/transitions, audit events, hub-scoped agent profiles, immutable skill versions, quota policies and reservations, and worker health policies. Use transactional updates and uniqueness constraints for idempotency and active claims. Delete request payloads when tasks reach terminal outcomes; keep result payloads and large diffs in the result queue or a configured artifact reference, retaining only a digest and pointer in the ledger rather than duplicating potentially large content.

Resolve a hub's profile from an explicitly referenced platform-governed baseline plus an authorized hub-specific configuration. Verify the caller's Supabase access token and active `admin` membership for that community through the existing Supabase Auth and row-level-security boundary; hub profile writes may only target the authenticated caller's own community. Platform baselines remain platform-operator managed. Hub configuration may narrow task types, allowed repository/spec paths, operations, and resource limits but cannot widen platform guardrails; it must retain all baseline-required skills and may add only separately approved skills. Version profile and skill definitions immutably so a task continues to refer to the exact versions approved at assignment time. Missing, withdrawn, cross-hub, or unauthorized versions fail closed.

### Worker execution boundary

Validate task envelopes and profile restrictions before dispatch. A handler loads the referenced OpenSpec artifacts, prepares an isolated bot branch/worktree, and invokes the configured custom-agent interface with only the required skills and permitted paths. Keep that interface behind an adapter so the fleet does not couple queue processing to a particular model or agent runtime; route model calls through the project's configured AI routing boundary and record model identifiers without logging prompts or secrets.

Run `openspec validate` against the task's change before emitting a successful result. Package the diff (or a secure artifact reference), task explanation, validation output, agent and skill versions, model identifiers, and final status into `coding_results_queue`. CI/GitHub automation accepts only validated successful results, applies them to bot branches, and opens or updates a human-review pull request. A failed validation, denied operation, exhausted retry, or missing spec is an explicit unsuccessful outcome and may also emit an alert.

### Deployment and rollback

Provision the four queues, dead-letter/retry policies, D1 binding, and additive D1 migrations before enabling producers or consumers. Add queue bindings and generated Worker types alongside the existing health route; reconcile the hand-maintained `src/worker/env.d.ts` with the Wrangler-generated binding types to avoid contradictory environment contracts.

Deploy consumers disabled or in a non-production environment first, then enable request producers and the boss, and finally enable task processing and result automation. Run the configured scheduled health/backlog monitor only after the corresponding task consumers are deployed. Rollback by disabling producers and queue consumers and reverting the Worker deployment; do not delete queues or audit rows. Preserve queued messages for controlled replay after a repair, and keep the existing health endpoint available throughout.

## Risks / Trade-offs

- [At-least-once delivery can repeat work] → Use D1 idempotency keys, transactional claims, assignment generations, bounded retries, and explicit terminal states.
- [A single shared task consumer can become a throughput bottleneck] → Keep specialization handlers independently bounded and observable; scale queue consumer concurrency and execution capacity through configuration before considering separate queues.
- [Generated code can escape intended scope or contain unsafe changes] → Enforce allowed paths/operations before actions, isolate bot branches, run repository CI and OpenSpec validation, and require human pull-request review.
- [Hub-specific settings can weaken platform policy] → Resolve profiles through a platform baseline and permit hub configuration only to narrow bounds; validate authorization and policy on every profile update and task assignment.
- [D1 coordination and audit writes may contend at high concurrency] → Keep transitions small and transactional, index task/hub/status lookups, and apply configured queue concurrency and quotas.
- [Queue or provider outages can stall tasks] → Use bounded retry and dead-letter policies, preserve explicit task states, emit alerts, and allow safe replay without duplicating effects.
- [Agent execution may expose source or task data to configured model providers] → Send only task-required context, use approved routing and profile policies, and exclude prompts, credentials, and unrelated private data from audit records.
