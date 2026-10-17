import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migrations = [
  "0001_governance_ledger.sql",
  "0002_sync_change_feed.sql",
  "0003_coding_task_fleet.sql",
].map((name) =>
  readFileSync(resolve(process.cwd(), "migrations/d1", name), "utf8"),
);

describe("D1 governance and ledger migration", () => {
  function createDatabase() {
    const database = new DatabaseSync(":memory:");
    for (const migration of migrations) {
      database.exec(migration);
    }
    return database;
  }

  function insertProfile(
    database: DatabaseSync,
    scopeKind: "platform" | "hub",
    scopeId: string,
    profileId = "agent-feature",
    status: "draft" | "approved" | "revoked" = "approved",
  ) {
    const profileJson = JSON.stringify({
      ...(scopeKind === "hub"
        ? { baselineProfile: { profileId: "agent-baseline", version: 1 } }
        : {}),
      taskTypes: ["feature_impl"],
      requiredSkills: [],
      allowedRepositoryPaths: ["src/**"],
      allowedSpecPaths: ["openspec/**"],
      allowedOperations: ["read", "write", "run_tests", "openspec_validate", "create_branch"],
      resourceLimits: {
        maxTokens: 10000,
        maxFiles: 10,
        maxDurationSeconds: 1800,
        maxDiffBytes: 250000,
      },
    });
    database.prepare(`
      insert into coding_agent_profiles (
        scope_kind, scope_id, profile_id, version, profile_json, status, created_by
      ) values (?, ?, ?, 1, ?, ?, 'test')
    `).run(scopeKind, scopeId, profileId, profileJson, status);
  }

  function insertTask(
    database: DatabaseSync,
    taskId: string,
    hubId = "hub-a",
    idempotencyKey = taskId,
    profileScopeKind: "platform" | "hub" = "platform",
    profileScopeId = "platform",
    profileId = "agent-feature",
  ) {
    database.prepare(`
      insert into coding_task_records (
        task_id, hub_id, project_id, repository, base_branch, producer_id,
        requested_by, source_request_id, idempotency_key, request_digest,
        specialization, priority,
        profile_scope_kind, profile_scope_id, profile_id, profile_version,
        spec_paths_json
      ) values (?, ?, 'repo', 'communitymesh/repo', 'main', 'producer',
        'user-1', ?, ?, 'sha256:digest', 'feature_impl', 50, ?, ?, ?, 1,
        '["openspec/changes/feature/spec.md"]')
    `).run(
      taskId,
      hubId,
      taskId,
      idempotencyKey,
      profileScopeKind,
      profileScopeId,
      profileId,
    );
  }

  it("creates policy, governance, coding fleet, ledger, and AI tables and indexes", () => {
    const database = createDatabase();
    const tables = database
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all() as Array<{ name: string }>;
    const indexes = database
      .prepare("select name from sqlite_master where type = 'index' order by name")
      .all() as Array<{ name: string }>;

    expect(tables.map(({ name }) => name)).toContain("private_proposal_ballots");
    expect(tables.map(({ name }) => name)).toContain("token_ledger_entries");
    expect(tables.map(({ name }) => name)).toContain("ai_run_logs");
    expect(tables.map(({ name }) => name)).toContain("sync_change_counters");
    expect(tables.map(({ name }) => name)).toContain("sync_change_feed");
    expect(tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "coding_agent_profiles",
        "coding_skill_versions",
        "coding_task_records",
        "coding_task_payloads",
        "coding_task_skills",
        "coding_task_attempts",
        "coding_task_events",
        "coding_audit_events",
        "coding_quota_policies",
        "coding_quota_reservations",
        "coding_worker_health_policies",
      ]),
    );
    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "community_policy_versions_approved_proposal_idx",
        "governance_proposals_open_close_idx",
        "proposal_voter_weights_member_idx",
        "rt_transfers_member_history_idx",
        "rt_transfers_recipient_history_idx",
        "token_ledger_member_history_idx",
        "token_ledger_source_event_idx",
        "ai_run_logs_agent_history_idx",
        "ai_run_logs_status_started_idx",
        "sync_change_feed_entity_idx",
        "coding_task_records_status_priority_idx",
        "coding_task_records_hub_status_idx",
        "coding_task_attempts_active_task_idx",
        "coding_task_events_task_idx",
        "coding_audit_events_task_idx",
        "coding_task_attempts_health_idx",
        "coding_quota_reservations_active_idx",
        "coding_worker_health_policies_scope_idx",
      ]),
    );
    database.close();
  });

  it("enforces hub-scoped profile identity and task idempotency", () => {
    const database = createDatabase();
    insertProfile(database, "hub", "hub-a");
    insertProfile(database, "hub", "hub-b");
    insertTask(database, "task-a1", "hub-a", "request-a", "hub", "hub-a");
    insertTask(database, "task-b1", "hub-b", "request-a", "hub", "hub-b");

    expect(() =>
      insertTask(database, "task-a2", "hub-a", "request-a", "hub", "hub-a"),
    ).toThrow();
    expect(() =>
      insertTask(database, "task-a3", "hub-a", "request-b", "hub", "hub-b"),
    ).toThrow();
    expect(
      database
        .prepare("select hub_id from coding_task_records order by hub_id")
        .all(),
    ).toEqual([{ hub_id: "hub-a" }, { hub_id: "hub-b" }]);
    database.close();
  });

  it("enforces valid task transitions, monotonic generations, and one active claim", () => {
    const database = createDatabase();
    insertProfile(database, "platform", "platform");
    insertTask(database, "task-state");
    database.prepare("update coding_task_records set status = 'queued' where task_id = ?")
      .run("task-state");
    database.prepare("update coding_task_records set status = 'running' where task_id = ?")
      .run("task-state");
    expect(() =>
      database.prepare("update coding_task_records set status = 'accepted' where task_id = ?")
        .run("task-state"),
    ).toThrow(/invalid coding task status transition/);
    expect(() =>
      database.prepare("update coding_task_records set assignment_generation = 0 where task_id = ?")
        .run("task-state"),
    ).toThrow();

    database.prepare(`
      insert into coding_task_attempts (
        attempt_id, task_id, assignment_generation, specialization,
        profile_scope_kind, profile_scope_id, profile_id, profile_version,
        worker_id, status
      ) values (
        'attempt-1', 'task-state', 1, 'feature_impl',
        'platform', 'platform', 'agent-feature', 1, 'worker-a', 'claimed'
      )
    `).run();
    expect(() =>
      database.prepare(`
        insert into coding_task_attempts (
          attempt_id, task_id, assignment_generation, specialization,
          profile_scope_kind, profile_scope_id, profile_id, profile_version,
          worker_id, status
        ) values (
          'attempt-2', 'task-state', 1, 'feature_impl',
          'platform', 'platform', 'agent-feature', 1, 'worker-b', 'running'
        )
      `).run(),
    ).toThrow();
    database.prepare("update coding_task_attempts set status = 'abandoned' where attempt_id = ?")
      .run("attempt-1");
    database.prepare(`
      update coding_task_records set assignment_generation = 2 where task_id = ?
    `).run("task-state");
    database.prepare(`
      insert into coding_task_attempts (
        attempt_id, task_id, assignment_generation, specialization,
        profile_scope_kind, profile_scope_id, profile_id, profile_version,
        worker_id, status
      ) values (
        'attempt-2', 'task-state', 2, 'feature_impl',
        'platform', 'platform', 'agent-feature', 1, 'worker-b', 'running'
      )
    `).run();
    database.prepare("update coding_task_records set status = 'succeeded' where task_id = ?")
      .run("task-state");
    expect(
      database.prepare("select status from coding_task_records where task_id = ?")
        .get("task-state"),
    ).toEqual({ status: "succeeded" });
    database.close();
  });

  it("reserves configured active-task quotas atomically and releases deferred work", () => {
    const database = createDatabase();
    insertProfile(database, "platform", "platform");
    insertTask(database, "quota-task-1", "hub-a");
    insertTask(database, "quota-task-2", "hub-a");
    database.prepare(`
      insert into coding_quota_policies (
        scope_kind, scope_id, dimension_kind, subject_id, max_active_tasks
      ) values ('hub', 'hub-a', 'user', 'user-1', 1)
    `).run();

    const reserve = (taskId: string) =>
      database.prepare(`
        insert into coding_quota_reservations (
          task_id, scope_kind, scope_id, dimension_kind, subject_id
        )
        select ?, 'hub', 'hub-a', 'user', 'user-1'
        where (
          select count(*) from coding_quota_reservations
          where scope_kind = 'hub' and scope_id = 'hub-a'
            and dimension_kind = 'user' and subject_id = 'user-1'
            and released_at is null
        ) < (
          select max_active_tasks from coding_quota_policies
          where scope_kind = 'hub' and scope_id = 'hub-a'
            and dimension_kind = 'user' and subject_id = 'user-1'
        )
      `).run(taskId).changes;

    expect(reserve("quota-task-1")).toBe(1);
    expect(reserve("quota-task-2")).toBe(0);
    database.prepare("update coding_task_records set status = 'deferred' where task_id = ?")
      .run("quota-task-1");
    expect(reserve("quota-task-2")).toBe(1);
    expect(() =>
      database.prepare(`
        insert into coding_quota_reservations (
          task_id, scope_kind, scope_id, dimension_kind, subject_id
        ) values ('quota-task-2', 'hub', 'hub-b', 'user', 'user-1')
      `).run(),
    ).toThrow(/crosses hub scope/);
    database.close();
  });

  it("rejects claims against superseded task assignment generations", () => {
    const database = createDatabase();
    insertProfile(database, "platform", "platform");
    insertTask(database, "stale-task");
    database.prepare(`
      update coding_task_records
      set status = 'queued', assignment_generation = 2
      where task_id = 'stale-task'
    `).run();

    expect(() => database.prepare(`
      insert into coding_task_attempts (
        attempt_id, task_id, assignment_generation, specialization,
        profile_scope_kind, profile_scope_id, profile_id, profile_version,
        worker_id, status
      ) values (
        'stale-attempt', 'stale-task', 1, 'feature_impl',
        'platform', 'platform', 'agent-feature', 1, 'worker-a', 'claimed'
      )
    `).run()).toThrow(/stale assignment generation/);
    database.close();
  });

  it("retains request payloads while active and deletes them after terminal outcomes", () => {
    const database = createDatabase();
    insertProfile(database, "platform", "platform");
    insertTask(database, "task-payload");
    database.prepare(`
      insert into coding_task_payloads (task_id, payload_json)
      values ('task-payload', '{"title":"active request"}')
    `).run();
    database.prepare(`
      update coding_task_records set status = 'queued' where task_id = 'task-payload'
    `).run();
    expect(
      database.prepare(`
        select count(*) as count from coding_task_payloads where task_id = 'task-payload'
      `).get(),
    ).toEqual({ count: 1 });
    database.prepare(`
      update coding_task_records set status = 'running' where task_id = 'task-payload'
    `).run();
    database.prepare(`
      update coding_task_records set status = 'succeeded' where task_id = 'task-payload'
    `).run();
    expect(
      database.prepare(`
        select count(*) as count from coding_task_payloads where task_id = 'task-payload'
      `).get(),
    ).toEqual({ count: 0 });
    database.close();
  });

  it("binds tasks to approved immutable skill versions within their hub", () => {
    const database = createDatabase();
    insertProfile(database, "platform", "platform");
    insertTask(database, "task-skills", "hub-a");
    database.prepare(`
      insert into coding_skill_versions (
        scope_kind, scope_id, skill_id, version, manifest_json, governance_status, created_by
      ) values ('hub', 'hub-a', 'spec-reader', 1, '{"capabilities":[]}', 'approved', 'test')
    `).run();
    database.prepare(`
      insert into coding_skill_versions (
        scope_kind, scope_id, skill_id, version, manifest_json, governance_status, created_by
      ) values ('hub', 'hub-b', 'spec-reader', 1, '{"capabilities":[]}', 'approved', 'test')
    `).run();
    database.prepare(`
      insert into coding_task_skills (task_id, scope_kind, scope_id, skill_id, version)
      values ('task-skills', 'hub', 'hub-a', 'spec-reader', 1)
    `).run();

    expect(() =>
      database.prepare(`
        insert into coding_task_skills (task_id, scope_kind, scope_id, skill_id, version)
        values ('task-skills', 'hub', 'hub-b', 'spec-reader', 1)
      `).run(),
    ).toThrow(/not approved for this hub/);
    expect(() =>
      database.prepare(`
        update coding_skill_versions set manifest_json = '{"changed":true}'
        where scope_id = 'hub-a' and skill_id = 'spec-reader'
      `).run(),
    ).toThrow(/immutable/);
    expect(() =>
      database.prepare(`
        delete from coding_skill_versions
        where scope_id = 'hub-a' and skill_id = 'spec-reader'
      `).run(),
    ).toThrow(/cannot be deleted/);
    database.close();
  });

  it("pages per-community changes without gaps after rollback", () => {
    const database = createDatabase();
    const completePolicy =
      '{"rewardRules":[],"rtToVtConversion":{},"perks":[],"governance":{},"tokenUnits":{"rtSubunitsPerToken":100,"vtSubunitsPerToken":1}}';
    database.exec(`
      insert into community_policy_versions (
        community_id, version, policy_json, submitted_by
      ) values ('community-1', 1, '${completePolicy}', 'member-1');
      insert into community_policy_versions (
        community_id, version, policy_json, submitted_by
      ) values ('community-2', 1, '${completePolicy}', 'member-2');
      insert into governance_proposals (
        proposal_id, community_id, proposer_id, title, description,
        requested_action_json
      ) values (
        'proposal-1', 'community-1', 'member-1', 'Test proposal',
        'Proposal description.', '{}'
      );
    `);
    database.exec("begin");
    database
      .prepare(`
        update governance_proposals
        set status = 'open', opens_at = '2026-01-01', closes_at = '2026-01-02'
        where proposal_id = ?
      `)
      .run("proposal-1");
    database.exec("rollback");
    database
      .prepare(`
        update governance_proposals
        set status = 'open', opens_at = '2026-01-01', closes_at = '2026-01-02'
        where proposal_id = ?
      `)
      .run("proposal-1");
    database.prepare("delete from governance_proposals where proposal_id = ?").run("proposal-1");

    const readPage = (after: number) =>
      database
        .prepare(`
          select cursor, entity_type, entity_id, revision, change_type
          from sync_change_feed
          where scope_kind = 'community' and scope_id = ? and cursor > ?
          order by cursor
          limit 2
        `)
        .all("community-1", after) as Array<{
        cursor: number;
        entity_type: string;
        entity_id: string;
        revision: number;
        change_type: string;
      }>;
    const changes = [];
    let after = 0;
    for (;;) {
      const page = readPage(after);
      if (page.length === 0) break;
      changes.push(...page);
      after = page.at(-1)?.cursor ?? after;
    }

    expect(changes.map((change) => change.cursor)).toEqual([1, 2, 3, 4]);
    expect(changes.map((change) => change.revision)).toEqual([1, 1, 2, 3]);
    expect(changes.at(-1)).toMatchObject({
      entity_type: "proposal",
      entity_id: "proposal-1",
      revision: 3,
      change_type: "delete",
    });
    expect(
      database
        .prepare(`
          select cursor from sync_change_feed
          where scope_kind = 'community' and scope_id = ?
          order by cursor
        `)
        .all("community-2"),
    ).toEqual([{ cursor: 1 }]);
    expect(
      database
        .prepare("select count(*) as count from sync_change_feed where entity_type = ?")
        .get("private_ballot"),
    ).toEqual({ count: 0 });
    database.close();
  });

  it("requires complete JSON policy data and keeps versions immutable", () => {
    const database = createDatabase();
    const insert = database.prepare(`
      insert into community_policy_versions (
        community_id, version, policy_json, submitted_by
      ) values (?, ?, ?, ?)
    `);
    const completePolicy =
      '{"rewardRules":[],"rtToVtConversion":{},"perks":[],"governance":{},"tokenUnits":{"rtSubunitsPerToken":100,"vtSubunitsPerToken":1}}';

    expect(() =>
      insert.run("community-1", 1, '{"rewardRules":[]}', "member-1"),
    ).toThrow();
    expect(() =>
      insert.run(
        "community-1",
        1,
        '{"rewardRules":[],"rtToVtConversion":{},"perks":[],"governance":{},"tokenUnits":{"rtSubunitsPerToken":0,"vtSubunitsPerToken":1}}',
        "member-1",
      ),
    ).toThrow();
    insert.run("community-1", 1, completePolicy, "member-1");
    expect(() =>
      database
        .prepare("update community_policy_versions set policy_json = ? where community_id = ?")
        .run(completePolicy, "community-1"),
    ).toThrow(/immutable/);
    database.close();
  });

  it("requires snapshotted positive weights for a single private ballot", () => {
    const database = createDatabase();
    database.exec(`
      insert into community_policy_versions (
        community_id, version, policy_json, submitted_by
      ) values (
        'community-1', 1,
        '{"rewardRules":[],"rtToVtConversion":{},"perks":[],"governance":{},"tokenUnits":{"rtSubunitsPerToken":100,"vtSubunitsPerToken":1}}',
        'member-1'
      );
      insert into governance_proposals (
        proposal_id, community_id, proposer_id, title, description,
        requested_action_json, status, opens_at, closes_at
      ) values (
        'proposal-1', 'community-1', 'member-1', 'Test proposal',
        'Proposal description.', '{}', 'open', '2026-01-01', '2026-01-02'
      );
      insert into proposal_voting_snapshots (
        proposal_id, community_id, eligible_vt_supply, quorum_basis_points,
        approval_basis_points, policy_version, opened_at
      ) values ('proposal-1', 'community-1', 10, 2000, 5001, 1, '2026-01-01');
      insert into proposal_voter_weights (proposal_id, member_id, voting_weight)
        values ('proposal-1', 'member-2', 3);
      insert into private_proposal_ballots (proposal_id, member_id, choice)
        values ('proposal-1', 'member-2', 'yes');
    `);

    expect(() =>
      database
        .prepare("insert into private_proposal_ballots (proposal_id, member_id, choice) values (?, ?, ?)")
        .run("proposal-1", "member-2", "no"),
    ).toThrow();
    expect(() =>
      database
        .prepare("insert into private_proposal_ballots (proposal_id, member_id, choice) values (?, ?, ?)")
        .run("proposal-1", "member-3", "yes"),
    ).toThrow();
    database.close();
  });

  it("binds voting snapshots to the proposal community and an existing policy version", () => {
    const database = createDatabase();
    database.exec(`
      insert into community_policy_versions (
        community_id, version, policy_json, submitted_by
      ) values (
        'community-1', 1,
        '{"rewardRules":[],"rtToVtConversion":{},"perks":[],"governance":{},"tokenUnits":{"rtSubunitsPerToken":100,"vtSubunitsPerToken":1}}',
        'member-1'
      );
      insert into governance_proposals (
        proposal_id, community_id, proposer_id, title, description,
        requested_action_json, status, opens_at, closes_at
      ) values (
        'proposal-1', 'community-1', 'member-1', 'Test proposal',
        'Proposal description.', '{}', 'open', '2026-01-01', '2026-01-02'
      );
    `);
    const insertSnapshot = database.prepare(`
      insert into proposal_voting_snapshots (
        proposal_id, community_id, eligible_vt_supply, quorum_basis_points,
        approval_basis_points, policy_version, opened_at
      ) values (?, ?, ?, ?, ?, ?, ?)
    `);

    expect(() =>
      insertSnapshot.run("proposal-1", "community-1", 10, 2000, 5001, 2, "2026-01-01"),
    ).toThrow();
    expect(() =>
      insertSnapshot.run("proposal-1", "community-2", 10, 2000, 5001, 1, "2026-01-01"),
    ).toThrow();
    insertSnapshot.run("proposal-1", "community-1", 10, 2000, 5001, 1, "2026-01-01");

    expect(() =>
      database
        .prepare("update proposal_voting_snapshots set eligible_vt_supply = 12 where proposal_id = ?")
        .run("proposal-1"),
    ).toThrow(/immutable/);
    database.close();
  });

  it("rejects negative balances and duplicate idempotency keys", () => {
    const database = createDatabase();
    const balanceInsert = database.prepare(`
      insert into member_token_balances (
        community_id, member_id, token_type, balance_subunits
      ) values (?, ?, ?, ?)
    `);
    expect(() => balanceInsert.run("community-1", "member-1", "RT", -1)).toThrow();
    expect(() => balanceInsert.run("community-1", "member-1", "RT", 1.5)).toThrow();
    balanceInsert.run("community-1", "member-1", "RT", 100);

    const transferInsert = database.prepare(`
      insert into rt_transfers (
        event_id, idempotency_key, source_event_id, community_id,
        sender_id, recipient_id, amount_subunits
      ) values (?, ?, ?, ?, ?, ?, ?)
    `);
    transferInsert.run("event-1", "idempotency-1", "source-1", "community-1", "a", "b", 10);
    expect(() =>
      transferInsert.run("event-2", "idempotency-1", "source-2", "community-1", "a", "b", 10),
    ).toThrow();
    database.close();
  });

  it("enforces idempotent ledger source keys and policy-version references", () => {
    const database = createDatabase();
    database.prepare(`
      insert into community_policy_versions (
        community_id, version, policy_json, submitted_by
      ) values (?, ?, ?, ?)
    `).run(
      "community-1",
      1,
      '{"rewardRules":[],"rtToVtConversion":{},"perks":[],"governance":{},"tokenUnits":{"rtSubunitsPerToken":100,"vtSubunitsPerToken":1}}',
      "member-1",
    );
    const insertLedgerEntry = database.prepare(`
      insert into token_ledger_entries (
        entry_id, event_id, entry_index, source_event_id, community_id,
        member_id, token_type, entry_type, amount_subunits, policy_version, reason
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const entry = [
      "entry-1",
      "event-1",
      0,
      "source-1",
      "community-1",
      "member-1",
      "RT",
      "mint",
      10,
      1,
      "Configured reward rule",
    ] as const;
    insertLedgerEntry.run(...entry);

    expect(() =>
      insertLedgerEntry.run(
        "entry-2",
        "event-2",
        0,
        "source-1",
        "community-1",
        "member-1",
        "RT",
        "mint",
        10,
        1,
        "Configured reward rule",
      ),
    ).toThrow();
    expect(() =>
      insertLedgerEntry.run(
        "entry-3",
        "event-3",
        0,
        "source-2",
        "community-2",
        "member-1",
        "RT",
        "mint",
        10,
        1,
        "Configured reward rule",
      ),
    ).toThrow();
    database.close();
  });

  it("keeps credit and token ledger entries append-only", () => {
    const database = createDatabase();
    database.prepare(`
      insert into token_ledger_entries (
        entry_id, event_id, entry_index, source_event_id, community_id,
        member_id, token_type, entry_type, amount_subunits, reason
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "entry-1",
      "event-1",
      0,
      "source-1",
      "community-1",
      "member-1",
      "RT",
      "award",
      10,
      "Configured rule award",
    );

    expect(() =>
      database
        .prepare("update token_ledger_entries set amount_subunits = 20 where entry_id = ?")
        .run("entry-1"),
    ).toThrow(/append-only/);
    database.close();
  });
});
