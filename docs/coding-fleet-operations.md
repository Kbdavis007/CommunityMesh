# Coding fleet operations

## Queue flow

Coding tasks enter only through trusted producers publishing validated request
messages to `coding_requests_queue`. The Worker exposes no HTTP endpoint that
executes coding requests; its HTTP health route is independent of queue work.
The producer identity and hub/project attribution must come from the
authenticated producer context, not caller-controlled fields.

| Queue | Producer | Purpose |
| --- | --- | --- |
| `coding_requests_queue` | UI, GitHub, or system adapters | Validated request envelopes for boss processing |
| `coding_tasks_queue` | Boss worker | Normalized, OpenSpec-grounded assignments |
| `coding_results_queue` | Specialized workers | Terminal outcome, validation status, explanation, and diff reference |
| `coding_alerts_queue` | Boss and specialized workers | Invalid requests, unresolved specs, quota limits, and operational failures |

The boss resolves the requested OpenSpec change, selects an approved profile
and its exact approved skill versions, writes the task and its audit events to
D1, then publishes the assignment. Duplicate producer deliveries are
idempotent by hub and producer request identity. Requests in one delivered
batch are processed in descending priority order; deferred tasks are retried
by descending priority and then creation time. Cloudflare does not provide a
global priority order across separate request batches.

The D1 lifecycle is:

```text
accepted -> queued -> running -> succeeded | failed | blocked | cancelled
     |         |         |
     +-> deferred <-+----+
             |
             +-> queued when quota/capacity is available
```

`blocked` tasks can be returned to `queued` after an authorized repair or
cancelled. Every transition is recorded in `coding_task_events`. A deferred
task retains its request payload so the boss can retry it. Terminal tasks
delete that payload and release any remaining quota reservations. Deferring a
task releases its reservations as well.

Assignments include `assignmentGeneration`. Reassignment increments that
generation and records the assignment in D1; consumers must reject stale
generations before claiming work. Reassignments stay within the same hub and
specialization and are bounded by the applicable worker health policy.

## Provisioning and deployment

1. Create the four Cloudflare Queues listed above before deploying the Worker.
   Configure the request and task consumers from `wrangler.jsonc`; exhausted
   deliveries use `coding_alerts_queue` as the dead-letter queue.
2. Configure the production D1 database name and ID in `wrangler.jsonc`, then
   apply the additive migrations. For local development:

   ```sh
   npm exec -- wrangler d1 migrations apply DB --local
   npm exec -- wrangler d1 migrations list DB --local
   npm run worker:dev
   ```

   For a reviewed production rollout, apply migrations with the configured
   remote database (`--remote`) only after confirming the target database.
3. Add an approved platform baseline and approved skill versions before
   enabling producers. Platform baselines are operator-managed. A signed-in
   community administrator can create an immutable hub profile version using
   `POST /api/v1/hubs/{communityId}/coding-agent-profiles`; the path ID is the
   Supabase community UUID. The Worker verifies the Supabase access token and
   active admin membership using Supabase Auth and the membership table's RLS.
   Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Worker variables/secrets for
   this control-plane route.
4. Add desired quota and health policies before enabling request producers.
   Configure platform baselines and quota/health policies through the
   privileged D1 administration path; do not grant browser clients direct D1
   access.
5. Validate the Worker configuration with `npm exec -- wrangler deploy
   --dry-run`, deploy the Worker, and then enable trusted producers. Wrangler
   schedules the fleet monitor every five minutes. Keep credentials such as
   `GITHUB_TOKEN` in Worker secrets, not source control.

Do not apply development reset commands to production. Disable producers and
consumers for rollback; preserve queues and D1 audit records so queued work can
be reviewed and replayed after a repair.

## Quotas and health policy

`coding_quota_policies` sets concurrent active-task limits. Policies can be
scoped to a hub or to `platform`; if both apply, a task must satisfy both.
Missing policies mean unlimited capacity for that dimension. `subject_id` is:

- `agent`: `<scope_kind>:<scope_id>:<profile_id>` (for example,
  `hub:hub-123:agent-feature`)
- `user`: the authenticated request `actorId`
- `project`: the request `projectId`

Example policies (replace the sample IDs and limits with approved values):

```sql
INSERT INTO coding_quota_policies
  (scope_kind, scope_id, dimension_kind, subject_id, max_active_tasks)
VALUES
  ('hub', 'hub-123', 'agent', 'hub:hub-123:agent-feature', 4),
  ('hub', 'hub-123', 'user', 'member-456', 2),
  ('hub', 'hub-123', 'project', 'project-789', 6);
```

`coding_worker_health_policies` is keyed by scope and specialization.
`max_backlog` is a D1 task-record threshold; `max_failure_rate_basis_points`
uses 10,000 basis points for 100%; `minimum_attempts` avoids alerting on a
small sample; `window_seconds` defines the measurement window;
`stale_task_seconds` detects old active claims; and `max_reassignments` bounds
automatic reassignment for a task. The five-minute monitor emits backlog,
failure-rate, reassignment, reassignment-limit, and quota alerts to
`coding_alerts_queue`. A hub-specific policy overrides the platform policy for
that specialization.

An approved profile JSON object declares `taskTypes`, exact
`requiredSkills` (`scopeKind`, `scopeId`, `skillId`, `version`), relative
`allowedRepositoryPaths`, `allowedSpecPaths`, `allowedOperations`, and
positive integer `resourceLimits` (`maxTokens`, `maxFiles`,
`maxDurationSeconds`, `maxDiffBytes`). Hub profiles must reference a specific
approved platform baseline version with `baselineProfile: { "profileId": "...",
"version": 1 }`. Hub task types, paths, and operations must be subsets of the
baseline; resource limits may only decrease; baseline-required skills cannot
be removed. Hub administrators may add only separately approved skills.

Example body for the authenticated hub-profile endpoint:

```json
{
  "profileId": "feature-agent",
  "version": 1,
  "profile": {
    "baselineProfile": { "profileId": "platform-feature", "version": 1 },
    "taskTypes": ["feature_impl"],
    "requiredSkills": [
      { "scopeKind": "platform", "scopeId": "platform", "skillId": "spec-reader", "version": 2 }
    ],
    "allowedRepositoryPaths": ["src/features/**"],
    "allowedSpecPaths": ["openspec/changes/**"],
    "allowedOperations": ["read", "write", "run_tests", "openspec_validate"],
    "resourceLimits": {
      "maxTokens": 10000,
      "maxFiles": 10,
      "maxDurationSeconds": 1800,
      "maxDiffBytes": 250000
    }
  }
}
```

Path permissions support exact repository-relative paths and directory
patterns ending in `/**`; traversal, absolute paths, and backslashes are
rejected. A hub profile is stored as an immutable approved version after the
Worker validates the bounds and skills. To change it, create a new version.

Example policy (illustrative thresholds only):

```sql
INSERT INTO coding_worker_health_policies (
  scope_kind, scope_id, specialization, window_seconds, minimum_attempts,
  max_reassignments, max_failure_rate_basis_points, stale_task_seconds,
  max_backlog
) VALUES (
  'hub', 'hub-123', 'feature_impl', 3600, 5,
  3, 2000, 1800, 20
);
```

Operators can inspect task backlog and active reservations directly in D1:

```sql
SELECT specialization, status, COUNT(*) AS task_count
FROM coding_task_records
GROUP BY specialization, status
ORDER BY specialization, status;

SELECT scope_kind, scope_id, dimension_kind, subject_id, COUNT(*) AS active_tasks
FROM coding_quota_reservations
WHERE released_at IS NULL
GROUP BY scope_kind, scope_id, dimension_kind, subject_id;
```

These queries report D1-backed task backlog and reservations. They are not a
substitute for Cloudflare's native queue-depth metrics; use Cloudflare queue
monitoring for messages that have not yet been accepted into D1.
