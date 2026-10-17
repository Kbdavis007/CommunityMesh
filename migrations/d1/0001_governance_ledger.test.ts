import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migrations = [
  "0001_governance_ledger.sql",
  "0002_sync_change_feed.sql",
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

  it("creates policy, governance, ledger, and AI tables and indexes", () => {
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
      ]),
    );
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
