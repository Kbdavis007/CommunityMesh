import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "migrations/d1/0001_governance_ledger.sql"),
  "utf8",
);

describe("D1 governance and ledger migration", () => {
  function createDatabase() {
    const database = new DatabaseSync(":memory:");
    database.exec(migration);
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
    expect(indexes.map(({ name }) => name)).toContain("token_ledger_member_history_idx");
    expect(indexes.map(({ name }) => name)).toContain("governance_proposals_open_close_idx");
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
      '{"rewardRules":[],"rtToVtConversion":{},"perks":[],"governance":{}}';

    expect(() =>
      insert.run("community-1", 1, '{"rewardRules":[]}', "member-1"),
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
      insert into governance_proposals (
        proposal_id, community_id, proposer_id, title, description,
        requested_action_json, status, opens_at, closes_at
      ) values (
        'proposal-1', 'community-1', 'member-1', 'Test proposal',
        'Proposal description.', '{}', 'open', '2026-01-01', '2026-01-02'
      );
      insert into proposal_voting_snapshots (
        proposal_id, eligible_vt_supply, quorum_basis_points,
        approval_basis_points, policy_version, opened_at
      ) values ('proposal-1', 10, 2000, 5001, 1, '2026-01-01');
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

  it("rejects negative balances and duplicate idempotency keys", () => {
    const database = createDatabase();
    const balanceInsert = database.prepare(`
      insert into member_token_balances (
        community_id, member_id, token_type, balance_subunits
      ) values (?, ?, ?, ?)
    `);
    expect(() => balanceInsert.run("community-1", "member-1", "RT", -1)).toThrow();
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
