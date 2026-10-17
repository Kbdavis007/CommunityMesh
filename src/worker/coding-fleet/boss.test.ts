import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCodingRequestMessage,
  type CodingRequestInput,
  type CodingTaskMessage,
} from "./contracts";
import {
  handleCodingFleetMonitor,
  handleCodingRequestBatch,
  processCodingRequest,
} from "./boss";

const migrations = [
  "0001_governance_ledger.sql",
  "0002_sync_change_feed.sql",
  "0003_coding_task_fleet.sql",
].map((name) => readFileSync(resolve(process.cwd(), "migrations/d1", name), "utf8"));

const proposal = `# Proposal

## Capabilities

### New Capabilities
- \`feature-work\`: Implements feature requests.

### Modified Capabilities

None.

## Impact

Cloudflare Worker.
`;

function openSpecFetcher(includeSpec = true) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/git/trees/main")) {
      return new Response(JSON.stringify({
        tree: [
          "openspec/changes/add-feature/proposal.md",
          "openspec/changes/add-feature/design.md",
          "openspec/changes/add-feature/tasks.md",
          ...(includeSpec
            ? ["openspec/changes/add-feature/specs/feature-work/spec.md"]
            : []),
        ].map((path) => ({ path, type: "blob" })),
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      type: "file",
      encoding: "base64",
      content: btoa(proposal),
    }), { status: 200 });
  });
}

function testDatabase() {
  const database = new DatabaseSync(":memory:");
  for (const migration of migrations) database.exec(migration);

  const prepare = (sql: string) => {
    let bindings: SQLInputValue[] = [];
    const statement = {
      bind(...values: SQLInputValue[]) {
        bindings = values;
        return statement;
      },
      async all<T>() {
        return {
          success: true,
          results: database.prepare(sql).all(...bindings) as T[],
        };
      },
      async first<T>() {
        return database.prepare(sql).get(...bindings) as T | undefined ?? null;
      },
      async run() {
        const result = database.prepare(sql).run(...bindings);
        return {
          success: true,
          meta: { changes: Number(result.changes) },
        };
      },
    };
    return statement;
  };

  const d1 = {
    prepare,
    async batch(statements: Array<ReturnType<typeof prepare>>) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { database, d1 };
}

function insertPlatformBaseline(database: DatabaseSync) {
  database.prepare(`
    insert into coding_agent_profiles (
      scope_kind, scope_id, profile_id, version, profile_json, status, created_by
    ) values ('platform', 'platform', 'agent-baseline', 1, ?, 'approved', 'operator')
  `).run(JSON.stringify({
    taskTypes: ["feature_impl", "refactor", "test_writer", "doc_writer", "bug_fix"],
    requiredSkills: [],
    allowedRepositoryPaths: ["src/**"],
    allowedSpecPaths: ["openspec/**"],
    allowedOperations: [
      "read",
      "write",
      "run_tests",
      "openspec_validate",
      "create_branch",
      "schema_change",
    ],
    resourceLimits: {
      maxTokens: 20000,
      maxFiles: 40,
      maxDurationSeconds: 3600,
      maxDiffBytes: 1000000,
    },
  }));
}

function insertHubProfile(database: DatabaseSync, profileId: string) {
  database.prepare(`
    insert into coding_agent_profiles (
      scope_kind, scope_id, profile_id, version, profile_json, status, created_by
    ) values ('hub', 'hub-1', ?, 1, ?, 'approved', 'admin')
  `).run(profileId, JSON.stringify({
    baselineProfile: { profileId: "agent-baseline", version: 1 },
    taskTypes: ["feature_impl"],
    requiredSkills: [],
    allowedRepositoryPaths: ["src/**"],
    allowedSpecPaths: ["openspec/changes/**"],
    allowedOperations: ["read", "write", "run_tests", "openspec_validate", "create_branch"],
    resourceLimits: {
      maxTokens: 10000,
      maxFiles: 10,
      maxDurationSeconds: 1800,
      maxDiffBytes: 250000,
    },
  }));
}

function createRequest(requestId = "request-1", priority = 50) {
  const input: CodingRequestInput = {
    requestId,
    repository: "communitymesh/app",
    baseBranch: "main",
    changeName: "add-feature",
    kind: "feature",
    title: "Add a feature",
    description: "Implement a feature from its OpenSpec change.",
    priority,
  };
  return createCodingRequestMessage({
    source: "ui",
    producerId: "ui-backend",
    actorId: "user-1",
    hubId: "hub-1",
    projectId: "project-1",
  }, input, "2026-10-17T00:00:00.000Z");
}

function createEnv(database: ReturnType<typeof testDatabase>["d1"]) {
  const tasks: CodingTaskMessage[] = [];
  const alerts: unknown[] = [];
  const env = {
    DB: database,
    GITHUB_TOKEN: "test-token",
    CODING_TASKS_QUEUE: {
      send: vi.fn(async (task: CodingTaskMessage) => {
        tasks.push(task);
      }),
    },
    CODING_ALERTS_QUEUE: {
      send: vi.fn(async (alert: unknown) => {
        alerts.push(alert);
      }),
    },
  } as unknown as Env;
  return { env, tasks, alerts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("boss coding request processing", () => {
  it("resolves OpenSpec, selects a hub profile, records provenance, and dispatches idempotently", async () => {
    const { database, d1 } = testDatabase();
    insertPlatformBaseline(database);
    insertHubProfile(database, "agent-feature");
    vi.stubGlobal("fetch", openSpecFetcher());
    const { env, tasks } = createEnv(d1);
    const request = createRequest();

    await expect(processCodingRequest(env, request)).resolves.toBe("dispatched");
    await expect(processCodingRequest(env, request)).resolves.toBe("already_processed");

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      requestId: "request-1",
      hubId: "hub-1",
      projectId: "project-1",
      specialization: "feature_impl",
      specPaths: [
        "openspec/changes/add-feature/proposal.md",
        "openspec/changes/add-feature/design.md",
        "openspec/changes/add-feature/tasks.md",
        "openspec/changes/add-feature/specs/feature-work/spec.md",
      ],
      profile: {
        scopeKind: "hub",
        scopeId: "hub-1",
        profileId: "agent-feature",
        version: 1,
      },
    });
    expect(
      database.prepare("select status from coding_task_records where task_id = ?")
        .get(tasks[0]?.taskId),
    ).toEqual({ status: "queued" });
    expect(
      database.prepare("select count(*) as count from coding_task_events where task_id = ?")
        .get(tasks[0]?.taskId),
    ).toEqual({ count: 2 });
    database.close();
  });

  it("alerts and acknowledges requests that cannot resolve their declared spec", async () => {
    const { database, d1 } = testDatabase();
    vi.stubGlobal("fetch", openSpecFetcher(false));
    const { env, alerts } = createEnv(d1);
    const ack = vi.fn();
    const retry = vi.fn();
    const batch = {
      queue: "coding_requests_queue",
      messages: [{ body: createRequest(), ack, retry }],
    } as unknown as MessageBatch;

    await handleCodingRequestBatch(batch, env);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      code: "spec_not_found",
      hubId: "hub-1",
    });
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    database.close();
  });

  it("dispatches each request batch in descending priority order", async () => {
    const { database, d1 } = testDatabase();
    insertPlatformBaseline(database);
    insertHubProfile(database, "agent-feature");
    vi.stubGlobal("fetch", openSpecFetcher());
    const { env, tasks } = createEnv(d1);
    const batch = {
      queue: "coding_requests_queue",
      messages: [
        { body: createRequest("low-priority", 10), ack: vi.fn(), retry: vi.fn() },
        { body: createRequest("high-priority", 90), ack: vi.fn(), retry: vi.fn() },
      ],
    } as unknown as MessageBatch;

    await handleCodingRequestBatch(batch, env);

    expect(tasks.map((task) => task.priority)).toEqual([90, 10]);
    database.close();
  });

  it("rejects a hub profile that widens its referenced platform baseline", async () => {
    const { database, d1 } = testDatabase();
    insertPlatformBaseline(database);
    database.prepare(`
      insert into coding_agent_profiles (
        scope_kind, scope_id, profile_id, version, profile_json, status, created_by
      ) values ('hub', 'hub-1', 'agent-feature', 1, ?, 'approved', 'admin')
    `).run(JSON.stringify({
      baselineProfile: { profileId: "agent-baseline", version: 1 },
      taskTypes: ["feature_impl"],
      requiredSkills: [],
      allowedRepositoryPaths: ["**"],
      allowedSpecPaths: ["openspec/changes/**"],
      allowedOperations: ["read", "write"],
      resourceLimits: {
        maxTokens: 10000,
        maxFiles: 10,
        maxDurationSeconds: 1800,
        maxDiffBytes: 250000,
      },
    }));
    vi.stubGlobal("fetch", openSpecFetcher());
    const { env } = createEnv(d1);

    await expect(processCodingRequest(env, createRequest())).rejects.toMatchObject({
      code: "profile_exceeds_baseline",
    });
    expect(
      database.prepare("select count(*) as count from coding_task_records").get(),
    ).toEqual({ count: 0 });
    database.close();
  });

  it("does not assign a profile to specs outside its permitted paths", async () => {
    const { database, d1 } = testDatabase();
    insertPlatformBaseline(database);
    database.prepare(`
      insert into coding_agent_profiles (
        scope_kind, scope_id, profile_id, version, profile_json, status, created_by
      ) values ('hub', 'hub-1', 'agent-feature', 1, ?, 'approved', 'admin')
    `).run(JSON.stringify({
      baselineProfile: { profileId: "agent-baseline", version: 1 },
      taskTypes: ["feature_impl"],
      requiredSkills: [],
      allowedRepositoryPaths: ["src/**"],
      allowedSpecPaths: ["openspec/specs/**"],
      allowedOperations: ["read", "write"],
      resourceLimits: {
        maxTokens: 10000,
        maxFiles: 10,
        maxDurationSeconds: 1800,
        maxDiffBytes: 250000,
      },
    }));
    vi.stubGlobal("fetch", openSpecFetcher());
    const { env } = createEnv(d1);

    await expect(processCodingRequest(env, createRequest())).rejects.toMatchObject({
      code: "spec_path_not_permitted",
    });
    expect(
      database.prepare("select count(*) as count from coding_task_records").get(),
    ).toEqual({ count: 0 });
    database.close();
  });

  it("defers quota-limited requests and retries them when capacity is released", async () => {
    const { database, d1 } = testDatabase();
    insertPlatformBaseline(database);
    insertHubProfile(database, "agent-feature");
    database.exec(`
      insert into coding_quota_policies (
        scope_kind, scope_id, dimension_kind, subject_id, max_active_tasks
      ) values ('hub', 'hub-1', 'user', 'user-1', 1);
    `);
    vi.stubGlobal("fetch", openSpecFetcher());
    const { env, tasks, alerts } = createEnv(d1);

    await expect(processCodingRequest(env, createRequest())).resolves.toBe("dispatched");
    await expect(processCodingRequest(env, createRequest("request-2"))).resolves.toBe("deferred");
    expect(alerts).toMatchObject([{ code: "quota_exceeded" }]);
    expect(
      database.prepare(`
        select status from coding_task_records
        where source_request_id = 'request-2'
      `).get(),
    ).toEqual({ status: "deferred" });
    expect(
      database.prepare("select count(*) as count from coding_task_payloads").get(),
    ).toEqual({ count: 2 });

    const firstTaskId = tasks[0]?.taskId;
    database.prepare(`
      update coding_task_records set status = 'running' where task_id = ?
    `).run(firstTaskId);
    database.prepare(`
      update coding_task_records set status = 'succeeded' where task_id = ?
    `).run(firstTaskId);
    await handleCodingFleetMonitor(env);

    expect(tasks).toHaveLength(2);
    expect(tasks[1]).toMatchObject({
      requestId: "request-2",
      assignmentGeneration: 2,
    });
    expect(
      database.prepare(`
        select status from coding_task_records where source_request_id = 'request-2'
      `).get(),
    ).toEqual({ status: "queued" });
    expect(
      database.prepare(`
        select count(*) as count from coding_task_payloads where task_id = ?
      `).get(firstTaskId),
    ).toEqual({ count: 0 });
    database.close();
  });

  it("reassigns stale work to another compatible profile with a new generation", async () => {
    const { database, d1 } = testDatabase();
    insertPlatformBaseline(database);
    insertHubProfile(database, "agent-a");
    insertHubProfile(database, "agent-b");
    database.exec(`
      insert into coding_worker_health_policies (
        scope_kind, scope_id, specialization, window_seconds,
        minimum_attempts, max_reassignments, max_failure_rate_basis_points,
        stale_task_seconds, max_backlog
      ) values ('hub', 'hub-1', 'feature_impl', 60, 1, 1, 5000, 1, 10);
    `);
    vi.stubGlobal("fetch", openSpecFetcher());
    const { env, tasks, alerts } = createEnv(d1);
    await processCodingRequest(env, createRequest());
    const taskId = tasks[0]?.taskId;
    database.prepare(`
      update coding_task_records set status = 'running' where task_id = ?
    `).run(taskId);
    database.prepare(`
      insert into coding_task_attempts (
        attempt_id, task_id, assignment_generation, specialization,
        profile_scope_kind, profile_scope_id, profile_id, profile_version,
        worker_id, status, claimed_at, started_at
      ) values (
        'attempt-stale', ?, 1, 'feature_impl',
        'hub', 'hub-1', ?, 1, 'worker-a', 'running', '2000-01-01T00:00:00Z',
        '2000-01-01T00:00:00Z'
      )
    `).run(taskId, tasks[0]?.profile.profileId);

    await handleCodingFleetMonitor(env);

    expect(tasks).toHaveLength(2);
    expect(tasks[1]).toMatchObject({
      taskId,
      assignmentGeneration: 2,
    });
    expect(tasks[1]?.profile.profileId).not.toBe(tasks[0]?.profile.profileId);
    expect(
      database.prepare(`
        select status, assignment_generation, reassign_count
        from coding_task_records where task_id = ?
      `).get(taskId),
    ).toEqual({ status: "queued", assignment_generation: 2, reassign_count: 1 });
    expect(
      database.prepare("select status from coding_task_attempts where attempt_id = ?")
        .get("attempt-stale"),
    ).toEqual({ status: "abandoned" });

    database.prepare(`
      update coding_task_records set status = 'running' where task_id = ?
    `).run(taskId);
    database.prepare(`
      insert into coding_task_attempts (
        attempt_id, task_id, assignment_generation, specialization,
        profile_scope_kind, profile_scope_id, profile_id, profile_version,
        worker_id, status, claimed_at, started_at
      ) values (
        'attempt-stale-2', ?, 2, 'feature_impl',
        'hub', 'hub-1', ?, 1, 'worker-b', 'running', '2000-01-01T00:00:00Z',
        '2000-01-01T00:00:00Z'
      )
    `).run(taskId, tasks[1]?.profile.profileId);
    await handleCodingFleetMonitor(env);

    expect(
      database.prepare(`
        select status, assignment_generation, reassign_count
        from coding_task_records where task_id = ?
      `).get(taskId),
    ).toEqual({ status: "deferred", assignment_generation: 2, reassign_count: 1 });
    expect(alerts.map((alert) => (alert as { code: string }).code)).toContain(
      "reassignment_limit_reached",
    );
    database.close();
  });

  it("reports configured backlog and worker failure-rate thresholds", async () => {
    const { database, d1 } = testDatabase();
    insertPlatformBaseline(database);
    insertHubProfile(database, "agent-feature");
    database.exec(`
      insert into coding_worker_health_policies (
        scope_kind, scope_id, specialization, window_seconds,
        minimum_attempts, max_reassignments, max_failure_rate_basis_points,
        stale_task_seconds, max_backlog
      ) values ('hub', 'hub-1', 'feature_impl', 60, 1, 3, 0, 3600, 1);
    `);
    vi.stubGlobal("fetch", openSpecFetcher());
    const { env, tasks, alerts } = createEnv(d1);
    await processCodingRequest(env, createRequest());
    database.prepare(`
      insert into coding_task_attempts (
        attempt_id, task_id, assignment_generation, specialization,
        profile_scope_kind, profile_scope_id, profile_id, profile_version,
        worker_id, status, finished_at
      ) values (
        'attempt-failed', ?, 1, 'feature_impl',
        'hub', 'hub-1', ?, 1, 'worker-a', 'failed',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
    `).run(tasks[0]?.taskId, tasks[0]?.profile.profileId);

    await handleCodingFleetMonitor(env);

    expect(alerts).toMatchObject([
      { code: "worker_backlog_threshold" },
      { code: "worker_failure_rate" },
    ]);
    database.close();
  });
});
