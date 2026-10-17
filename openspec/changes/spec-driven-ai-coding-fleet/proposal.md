# Proposal

## Why

CommunityMesh has no coding-task worker pipeline today: its Cloudflare Worker exposes only a health endpoint, while the project's AI and OpenSpec plans do not define a controlled path from coding requests to reviewed code changes. A queue-driven, auditable fleet will let the project scale coding work without allowing workers to act directly on user requests, bypass specifications, or write to the main branch.

## What Changes

- Add a boss worker that consumes queued coding requests, resolves their OpenSpec context, assigns a specialized agent and required skills, enforces configurable per-agent, per-user, and per-project limits, and dispatches normalized tasks.
- Add specialized queue consumers for feature implementation, refactoring, test authoring, documentation, and bug fixing. Workers will process only assigned queue tasks, validate against OpenSpec, and publish diffs, explanations, and validation outcomes.
- Define governed agent profiles and skills, including allowed paths and operations, hub-level customization, versioned skills, and per-task skill-use records.
- Add queue-backed task lifecycle, health/backlog/quota monitoring, bounded reassignment, alerts, and audit records; keep changes on bot branches for human-reviewed pull requests.
- Establish Cloudflare Queues and D1 as the task transport and task/audit record store, respectively, with explicit result and alert flows.

## Capabilities

### New Capabilities
- `coding-task-orchestration`: Intake from request queues, task normalization, spec resolution, specialization assignment, quotas, prioritization, overload reassignment, lifecycle, and monitoring.
- `coding-worker-execution`: Queue-only specialized worker processing, OpenSpec-first execution, validation, bot-branch diffs, and result/alert publication.
- `coding-agent-governance`: Agent profiles, required and versioned skills, hub-level customization, permitted operations/paths, and traceable skill/model usage.

### Modified Capabilities

None. The repository has no main `openspec/specs/` capability inventory yet; existing AI requirements are pending change deltas rather than established main specs. This change introduces distinct coding-fleet behavior without modifying those pending AI capabilities.

## Impact

The primary implementation surface is the Cloudflare Worker, whose current application code only serves `/api/v1/health`. The change will also affect Worker bindings/configuration, D1 schema and migrations, queue producers and consumers, OpenSpec integration, agent/skill configuration, tests, and CI/GitHub automation that applies results to bot branches and opens pull requests. It introduces dependencies on Cloudflare Queues and D1-backed task/audit storage; it does not change the existing public health endpoint.
