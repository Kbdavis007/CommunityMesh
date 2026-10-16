PRAGMA foreign_keys = ON;

CREATE TABLE community_policy_versions (
  community_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  policy_json TEXT NOT NULL CHECK (
    json_valid(policy_json)
    AND json_type(policy_json) = 'object'
    AND COALESCE(json_type(policy_json, '$.rewardRules'), '') = 'array'
    AND COALESCE(json_type(policy_json, '$.rtToVtConversion'), '') = 'object'
    AND COALESCE(json_type(policy_json, '$.perks'), '') = 'array'
    AND COALESCE(json_type(policy_json, '$.governance'), '') = 'object'
    AND COALESCE(json_type(policy_json, '$.tokenUnits'), '') = 'object'
    AND COALESCE(json_type(policy_json, '$.tokenUnits.rtSubunitsPerToken'), '') = 'integer'
    AND json_extract(policy_json, '$.tokenUnits.rtSubunitsPerToken') > 0
    AND COALESCE(json_type(policy_json, '$.tokenUnits.vtSubunitsPerToken'), '') = 'integer'
    AND json_extract(policy_json, '$.tokenUnits.vtSubunitsPerToken') > 0
  ),
  submitted_by TEXT NOT NULL,
  approved_by_proposal_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  effective_at TEXT,
  PRIMARY KEY (community_id, version),
  FOREIGN KEY (approved_by_proposal_id, community_id)
    REFERENCES governance_proposals (proposal_id, community_id)
);

CREATE TABLE community_active_policies (
  community_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  activated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (community_id, version)
    REFERENCES community_policy_versions (community_id, version)
);

CREATE TABLE governance_proposals (
  proposal_id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  proposer_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 20000),
  requested_action_json TEXT NOT NULL CHECK (
    json_valid(requested_action_json)
    AND json_type(requested_action_json) = 'object'
  ),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'passed', 'failed', 'cancelled')),
  opens_at TEXT,
  closes_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (status = 'draft' AND opens_at IS NULL AND closes_at IS NULL)
    OR
    (status <> 'draft' AND opens_at IS NOT NULL AND closes_at IS NOT NULL
      AND closes_at > opens_at)
  ),
  UNIQUE (proposal_id, community_id)
);

CREATE TABLE proposal_voting_snapshots (
  proposal_id TEXT PRIMARY KEY
    REFERENCES governance_proposals (proposal_id) ON DELETE RESTRICT,
  community_id TEXT NOT NULL,
  eligible_vt_supply INTEGER NOT NULL CHECK (eligible_vt_supply >= 0),
  quorum_basis_points INTEGER NOT NULL CHECK (quorum_basis_points BETWEEN 0 AND 10000),
  approval_basis_points INTEGER NOT NULL CHECK (approval_basis_points BETWEEN 0 AND 10000),
  policy_version INTEGER NOT NULL CHECK (policy_version > 0),
  opened_at TEXT NOT NULL,
  FOREIGN KEY (proposal_id, community_id)
    REFERENCES governance_proposals (proposal_id, community_id) ON DELETE RESTRICT,
  FOREIGN KEY (community_id, policy_version)
    REFERENCES community_policy_versions (community_id, version) ON DELETE RESTRICT
);

CREATE TABLE proposal_voter_weights (
  proposal_id TEXT NOT NULL
    REFERENCES proposal_voting_snapshots (proposal_id) ON DELETE RESTRICT,
  member_id TEXT NOT NULL,
  voting_weight INTEGER NOT NULL CHECK (voting_weight > 0),
  PRIMARY KEY (proposal_id, member_id)
);

CREATE TABLE private_proposal_ballots (
  proposal_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  choice TEXT NOT NULL CHECK (choice IN ('yes', 'no', 'abstain')),
  cast_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (proposal_id, member_id),
  FOREIGN KEY (proposal_id, member_id)
    REFERENCES proposal_voter_weights (proposal_id, member_id) ON DELETE RESTRICT
);

CREATE TABLE governance_executions (
  execution_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL UNIQUE
    REFERENCES governance_proposals (proposal_id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  handler_key TEXT NOT NULL CHECK (length(trim(handler_key)) > 0),
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'unsupported')),
  result_json TEXT NOT NULL CHECK (
    json_valid(result_json) AND json_type(result_json) = 'object'
  ),
  executed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE member_token_balances (
  community_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  token_type TEXT NOT NULL CHECK (token_type IN ('CC', 'WC', 'RT', 'VT')),
  balance_subunits INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(balance_subunits) = 'integer' AND balance_subunits >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (community_id, member_id, token_type)
);

CREATE TABLE member_rt_earnings (
  community_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  cumulative_earned_subunits INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(cumulative_earned_subunits) = 'integer'
      AND cumulative_earned_subunits >= 0),
  cumulative_vt_granted_subunits INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(cumulative_vt_granted_subunits) = 'integer'
      AND cumulative_vt_granted_subunits >= 0),
  last_policy_version INTEGER,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (community_id, member_id),
  FOREIGN KEY (community_id, last_policy_version)
    REFERENCES community_policy_versions (community_id, version)
);

CREATE TABLE token_ledger_entries (
  entry_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  entry_index INTEGER NOT NULL CHECK (entry_index >= 0),
  source_event_id TEXT NOT NULL,
  community_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  token_type TEXT NOT NULL CHECK (token_type IN ('CC', 'WC', 'RT', 'VT')),
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'award', 'mint', 'correction', 'transfer_in', 'transfer_out',
      'perk_redemption', 'vt_milestone'
    )
  ),
  amount_subunits INTEGER NOT NULL CHECK (
    typeof(amount_subunits) = 'integer'
    AND amount_subunits <> 0
    AND (
      entry_type = 'correction'
      OR (entry_type IN ('transfer_out', 'perk_redemption') AND amount_subunits < 0)
      OR (entry_type NOT IN ('transfer_out', 'perk_redemption') AND amount_subunits > 0)
    )
  ),
  policy_version INTEGER,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (event_id, entry_index),
  UNIQUE (source_event_id, entry_index),
  FOREIGN KEY (community_id, policy_version)
    REFERENCES community_policy_versions (community_id, version)
);

CREATE TABLE rt_transfers (
  event_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  source_event_id TEXT NOT NULL UNIQUE,
  community_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  amount_subunits INTEGER NOT NULL CHECK (
    typeof(amount_subunits) = 'integer' AND amount_subunits > 0
  ),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (sender_id <> recipient_id)
);

CREATE TABLE rt_perk_redemptions (
  redemption_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  source_event_id TEXT NOT NULL UNIQUE,
  community_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  perk_id TEXT NOT NULL,
  amount_subunits INTEGER NOT NULL CHECK (
    typeof(amount_subunits) = 'integer' AND amount_subunits > 0
  ),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fulfilled_at TEXT
);

CREATE TABLE ai_run_logs (
  run_id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL CHECK (
    agent_name IN (
      'ai_moderator', 'ai_curator', 'ai_task_dispatcher',
      'ai_summarizer', 'ai_maintenance'
    )
  ),
  model_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'degraded')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  outcome_summary TEXT,
  affected_record_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(affected_record_ids_json)
    AND json_type(affected_record_ids_json) = 'array'
  ),
  error_code TEXT,
  CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR
    (status <> 'running' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX governance_proposals_community_status_created_idx
  ON governance_proposals (community_id, status, created_at DESC);
CREATE INDEX governance_proposals_open_close_idx
  ON governance_proposals (status, closes_at)
  WHERE status = 'open';
CREATE INDEX proposal_voter_weights_member_idx
  ON proposal_voter_weights (member_id, proposal_id);
CREATE INDEX token_ledger_member_history_idx
  ON token_ledger_entries (community_id, member_id, created_at DESC);
CREATE INDEX token_ledger_source_event_idx
  ON token_ledger_entries (source_event_id);
CREATE INDEX community_policy_versions_approved_proposal_idx
  ON community_policy_versions (approved_by_proposal_id)
  WHERE approved_by_proposal_id IS NOT NULL;
CREATE INDEX rt_transfers_member_history_idx
  ON rt_transfers (community_id, sender_id, created_at DESC);
CREATE INDEX rt_transfers_recipient_history_idx
  ON rt_transfers (community_id, recipient_id, created_at DESC);
CREATE INDEX rt_perk_redemptions_member_history_idx
  ON rt_perk_redemptions (community_id, member_id, created_at DESC);
CREATE INDEX ai_run_logs_agent_history_idx
  ON ai_run_logs (agent_name, started_at DESC);
CREATE INDEX ai_run_logs_status_started_idx
  ON ai_run_logs (status, started_at DESC);

CREATE TRIGGER token_ledger_entries_no_update
BEFORE UPDATE ON token_ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'token ledger entries are append-only');
END;

CREATE TRIGGER token_ledger_entries_no_delete
BEFORE DELETE ON token_ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'token ledger entries are append-only');
END;

CREATE TRIGGER community_policy_versions_no_update
BEFORE UPDATE ON community_policy_versions
BEGIN
  SELECT RAISE(ABORT, 'community policy versions are immutable');
END;

CREATE TRIGGER community_policy_versions_no_delete
BEFORE DELETE ON community_policy_versions
BEGIN
  SELECT RAISE(ABORT, 'community policy versions are immutable');
END;

CREATE TRIGGER proposal_voting_snapshots_no_update
BEFORE UPDATE ON proposal_voting_snapshots
BEGIN
  SELECT RAISE(ABORT, 'proposal voting snapshots are immutable');
END;

CREATE TRIGGER proposal_voting_snapshots_no_delete
BEFORE DELETE ON proposal_voting_snapshots
BEGIN
  SELECT RAISE(ABORT, 'proposal voting snapshots are immutable');
END;

CREATE TRIGGER proposal_voter_weights_no_update
BEFORE UPDATE ON proposal_voter_weights
BEGIN
  SELECT RAISE(ABORT, 'proposal voter weights are immutable');
END;

CREATE TRIGGER proposal_voter_weights_no_delete
BEFORE DELETE ON proposal_voter_weights
BEGIN
  SELECT RAISE(ABORT, 'proposal voter weights are immutable');
END;
