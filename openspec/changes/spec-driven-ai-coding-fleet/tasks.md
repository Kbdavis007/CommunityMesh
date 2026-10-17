# Tasks

## 1. Cloudflare and D1 Foundations

- [ ] 1.1 Add the four queue bindings, consumer retry/dead-letter policies, and local development configuration; verify Wrangler types generation and local Worker startup recognize every binding.
- [ ] 1.2 Add additive D1 migrations for task lifecycle, claims, audit events, hub-scoped profiles, and immutable skill versions; verify migration tests cover uniqueness, state transitions, and hub isolation.
- [ ] 1.3 Reconcile hand-maintained and Wrangler-generated Worker environment types; verify TypeScript build passes and the existing `/api/v1/health` tests remain unchanged.

## 2. Request Intake and Boss Orchestration

- [ ] 2.1 Define validated request, task, result, and alert message contracts and authorized queue producer adapters for UI, GitHub, and system requests; verify invalid envelopes are rejected and no worker executes request HTTP traffic.
- [ ] 2.2 Implement the boss queue consumer to resolve OpenSpec artifacts, specialization, agent profile, required skills, and hub/project attribution before recording and publishing a task; verify valid requests dispatch and unresolved requests emit actionable alerts.
- [ ] 2.3 Implement priority selection, per-agent/user/project quotas, backlog and worker-health signals, and bounded overload reassignment with assignment generations; verify quota boundaries, deferred work, stale-message rejection, and redelivery do not duplicate tasks.
- [ ] 2.4 Document request/task lifecycle and operator configuration; verify the documented queue names, state transitions, and quota/reassignment controls match the implemented contracts.

## 3. Agent and Skill Governance

- [ ] 3.1 Implement platform-baseline and hub-scoped agent profiles with supported task types, allowed paths/operations, resource limits, and permission checks; verify cross-hub access is denied and hub settings cannot widen platform guardrails.
- [ ] 3.2 Implement immutable, governed skill versions and bind each task to approved profile and skill versions; verify missing, withdrawn, or unapproved versions fail closed without silent substitution.
- [ ] 3.3 Record task provenance for spec paths, profile/skill versions, model identifiers, outcomes, denied actions, and diff references; verify audit tests confirm required fields while excluding prompts and secrets.

## 4. Specialized Worker Execution

- [ ] 4.1 Implement the shared task-queue consumer and specialization registry for feature implementation, refactoring, test writing, documentation, and bug fixing; verify each task reaches only its matching handler and malformed or unknown tasks are explicitly rejected.
- [ ] 4.2 Implement the custom-agent execution adapter, OpenSpec loading, permission enforcement, and isolated bot-branch/worktree changes; verify missing specs and prohibited main-branch or out-of-scope operations stop before code changes.
- [ ] 4.3 Add bounded retry and idempotent claims for duplicate and transient queue deliveries; verify active and terminal tasks do not repeat code effects and exhausted retries are reported as failures.
- [ ] 4.4 Run OpenSpec validation before success and publish explicit results and alerts containing validation status, explanation, diff/reference, and failure details; verify validation failures can never produce a successful result.

## 5. Results, Operations, and Integration

- [ ] 5.1 Implement result-queue automation that applies only validated results to bot branches and opens or updates human-review pull requests; verify successful results never write to the main branch and invalid results are not applied.
- [ ] 5.2 Add fleet health, queue backlog, quota, provider-routing, and worker failure reporting plus deployment/rollback documentation; verify alert scenarios and documented recovery/replay steps against local or test environments.
- [ ] 5.3 Run end-to-end queue-to-result tests and the project build, lint, and OpenSpec validation; verify the health endpoint remains available and all new task outcomes are traceable to specs, agents, skills, models, and diffs.
