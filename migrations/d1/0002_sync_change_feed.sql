ALTER TABLE governance_proposals
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
    CHECK (typeof(revision) = 'integer' AND revision > 0);
ALTER TABLE community_policy_versions
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
    CHECK (typeof(revision) = 'integer' AND revision > 0);
ALTER TABLE governance_executions
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
    CHECK (typeof(revision) = 'integer' AND revision > 0);
ALTER TABLE ai_run_logs
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
    CHECK (typeof(revision) = 'integer' AND revision > 0);

CREATE TABLE sync_change_counters (
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('community', 'global')),
  scope_id TEXT NOT NULL CHECK (length(trim(scope_id)) > 0),
  last_cursor INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(last_cursor) = 'integer' AND last_cursor >= 0),
  PRIMARY KEY (scope_kind, scope_id)
);

CREATE TABLE sync_change_feed (
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  cursor INTEGER NOT NULL CHECK (typeof(cursor) = 'integer' AND cursor > 0),
  entity_type TEXT NOT NULL CHECK (length(trim(entity_type)) > 0),
  entity_id TEXT NOT NULL CHECK (length(trim(entity_id)) > 0),
  revision INTEGER NOT NULL CHECK (typeof(revision) = 'integer' AND revision > 0),
  change_type TEXT NOT NULL CHECK (change_type IN ('upsert', 'delete')),
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (scope_kind, scope_id, cursor),
  UNIQUE (scope_kind, scope_id, entity_type, entity_id, revision),
  FOREIGN KEY (scope_kind, scope_id)
    REFERENCES sync_change_counters (scope_kind, scope_id)
);

CREATE INDEX sync_change_feed_entity_idx
  ON sync_change_feed (
    scope_kind, scope_id, entity_type, entity_id, revision
  );

CREATE TRIGGER governance_proposals_revision_cannot_decrease
BEFORE UPDATE OF revision ON governance_proposals
WHEN NEW.revision < OLD.revision
BEGIN
  SELECT RAISE(ABORT, 'sync revision cannot decrease');
END;

CREATE TRIGGER governance_proposals_revision_update
AFTER UPDATE ON governance_proposals
WHEN NEW.revision = OLD.revision
BEGIN
  UPDATE governance_proposals
  SET revision = OLD.revision + 1
  WHERE proposal_id = OLD.proposal_id;
END;

CREATE TRIGGER governance_proposals_change_insert
AFTER INSERT ON governance_proposals
BEGIN
  INSERT INTO sync_change_counters (scope_kind, scope_id, last_cursor)
  VALUES ('community', NEW.community_id, 1)
  ON CONFLICT (scope_kind, scope_id) DO UPDATE
    SET last_cursor = last_cursor + 1;
  INSERT INTO sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id, revision, change_type
  )
  SELECT 'community', NEW.community_id, last_cursor, 'proposal',
    NEW.proposal_id, NEW.revision, 'upsert'
  FROM sync_change_counters
  WHERE scope_kind = 'community' AND scope_id = NEW.community_id;
END;

CREATE TRIGGER governance_proposals_change_update
AFTER UPDATE ON governance_proposals
WHEN NEW.revision > OLD.revision
BEGIN
  INSERT INTO sync_change_counters (scope_kind, scope_id, last_cursor)
  VALUES ('community', NEW.community_id, 1)
  ON CONFLICT (scope_kind, scope_id) DO UPDATE
    SET last_cursor = last_cursor + 1;
  INSERT INTO sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id, revision, change_type
  )
  SELECT 'community', NEW.community_id, last_cursor, 'proposal',
    NEW.proposal_id, NEW.revision, 'upsert'
  FROM sync_change_counters
  WHERE scope_kind = 'community' AND scope_id = NEW.community_id;
END;

CREATE TRIGGER governance_proposals_change_delete
AFTER DELETE ON governance_proposals
BEGIN
  INSERT INTO sync_change_counters (scope_kind, scope_id, last_cursor)
  VALUES ('community', OLD.community_id, 1)
  ON CONFLICT (scope_kind, scope_id) DO UPDATE
    SET last_cursor = last_cursor + 1;
  INSERT INTO sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id, revision, change_type
  )
  SELECT 'community', OLD.community_id, last_cursor, 'proposal',
    OLD.proposal_id, OLD.revision + 1, 'delete'
  FROM sync_change_counters
  WHERE scope_kind = 'community' AND scope_id = OLD.community_id;
END;

CREATE TRIGGER community_policy_versions_change_insert
AFTER INSERT ON community_policy_versions
BEGIN
  INSERT INTO sync_change_counters (scope_kind, scope_id, last_cursor)
  VALUES ('community', NEW.community_id, 1)
  ON CONFLICT (scope_kind, scope_id) DO UPDATE
    SET last_cursor = last_cursor + 1;
  INSERT INTO sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id, revision, change_type
  )
  SELECT 'community', NEW.community_id, last_cursor, 'policy_version',
    NEW.community_id || ':' || NEW.version, NEW.revision, 'upsert'
  FROM sync_change_counters
  WHERE scope_kind = 'community' AND scope_id = NEW.community_id;
END;

CREATE TRIGGER community_policy_versions_change_delete
AFTER DELETE ON community_policy_versions
BEGIN
  INSERT INTO sync_change_counters (scope_kind, scope_id, last_cursor)
  VALUES ('community', OLD.community_id, 1)
  ON CONFLICT (scope_kind, scope_id) DO UPDATE
    SET last_cursor = last_cursor + 1;
  INSERT INTO sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id, revision, change_type
  )
  SELECT 'community', OLD.community_id, last_cursor, 'policy_version',
    OLD.community_id || ':' || OLD.version, OLD.revision + 1, 'delete'
  FROM sync_change_counters
  WHERE scope_kind = 'community' AND scope_id = OLD.community_id;
END;

CREATE TRIGGER governance_executions_revision_cannot_decrease
BEFORE UPDATE OF revision ON governance_executions
WHEN NEW.revision < OLD.revision
BEGIN
  SELECT RAISE(ABORT, 'sync revision cannot decrease');
END;

CREATE TRIGGER governance_executions_revision_update
AFTER UPDATE ON governance_executions
WHEN NEW.revision = OLD.revision
BEGIN
  UPDATE governance_executions
  SET revision = OLD.revision + 1
  WHERE execution_id = OLD.execution_id;
END;

CREATE TRIGGER governance_executions_change_insert
AFTER INSERT ON governance_executions
BEGIN
  INSERT INTO sync_change_counters (scope_kind, scope_id, last_cursor)
  VALUES (
    'community',
    (SELECT community_id FROM governance_proposals WHERE proposal_id = NEW.proposal_id),
    1
  )
  ON CONFLICT (scope_kind, scope_id) DO UPDATE
    SET last_cursor = last_cursor + 1;
  INSERT INTO sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id, revision, change_type
  )
  SELECT 'community', proposal.community_id, counter.last_cursor,
    'governance_execution', NEW.execution_id, NEW.revision, 'upsert'
  FROM governance_proposals proposal
  JOIN sync_change_counters counter
    ON counter.scope_kind = 'community'
    AND counter.scope_id = proposal.community_id
  WHERE proposal.proposal_id = NEW.proposal_id;
END;

CREATE TRIGGER governance_executions_change_update
AFTER UPDATE ON governance_executions
WHEN NEW.revision > OLD.revision
BEGIN
  INSERT INTO sync_change_counters (scope_kind, scope_id, last_cursor)
  VALUES (
    'community',
    (SELECT community_id FROM governance_proposals WHERE proposal_id = NEW.proposal_id),
    1
  )
  ON CONFLICT (scope_kind, scope_id) DO UPDATE
    SET last_cursor = last_cursor + 1;
  INSERT INTO sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id, revision, change_type
  )
  SELECT 'community', proposal.community_id, counter.last_cursor,
    'governance_execution', NEW.execution_id, NEW.revision, 'upsert'
  FROM governance_proposals proposal
  JOIN sync_change_counters counter
    ON counter.scope_kind = 'community'
    AND counter.scope_id = proposal.community_id
  WHERE proposal.proposal_id = NEW.proposal_id;
END;

CREATE TRIGGER governance_executions_change_delete
AFTER DELETE ON governance_executions
BEGIN
  INSERT INTO sync_change_counters (scope_kind, scope_id, last_cursor)
  VALUES (
    'community',
    (SELECT community_id FROM governance_proposals WHERE proposal_id = OLD.proposal_id),
    1
  )
  ON CONFLICT (scope_kind, scope_id) DO UPDATE
    SET last_cursor = last_cursor + 1;
  INSERT INTO sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id, revision, change_type
  )
  SELECT 'community', proposal.community_id, counter.last_cursor,
    'governance_execution', OLD.execution_id, OLD.revision + 1, 'delete'
  FROM governance_proposals proposal
  JOIN sync_change_counters counter
    ON counter.scope_kind = 'community'
    AND counter.scope_id = proposal.community_id
  WHERE proposal.proposal_id = OLD.proposal_id;
END;

CREATE TRIGGER ai_run_logs_revision_cannot_decrease
BEFORE UPDATE OF revision ON ai_run_logs
WHEN NEW.revision < OLD.revision
BEGIN
  SELECT RAISE(ABORT, 'sync revision cannot decrease');
END;

CREATE TRIGGER ai_run_logs_revision_update
AFTER UPDATE ON ai_run_logs
WHEN NEW.revision = OLD.revision
BEGIN
  UPDATE ai_run_logs
  SET revision = OLD.revision + 1
  WHERE run_id = OLD.run_id;
END;

CREATE TRIGGER ai_run_logs_change_insert
AFTER INSERT ON ai_run_logs
BEGIN
  INSERT INTO sync_change_counters (scope_kind, scope_id, last_cursor)
  VALUES ('global', 'public', 1)
  ON CONFLICT (scope_kind, scope_id) DO UPDATE
    SET last_cursor = last_cursor + 1;
  INSERT INTO sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id, revision, change_type
  )
  SELECT 'global', 'public', last_cursor, 'ai_run',
    NEW.run_id, NEW.revision, 'upsert'
  FROM sync_change_counters
  WHERE scope_kind = 'global' AND scope_id = 'public';
END;

CREATE TRIGGER ai_run_logs_change_update
AFTER UPDATE ON ai_run_logs
WHEN NEW.revision > OLD.revision
BEGIN
  INSERT INTO sync_change_counters (scope_kind, scope_id, last_cursor)
  VALUES ('global', 'public', 1)
  ON CONFLICT (scope_kind, scope_id) DO UPDATE
    SET last_cursor = last_cursor + 1;
  INSERT INTO sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id, revision, change_type
  )
  SELECT 'global', 'public', last_cursor, 'ai_run',
    NEW.run_id, NEW.revision, 'upsert'
  FROM sync_change_counters
  WHERE scope_kind = 'global' AND scope_id = 'public';
END;

CREATE TRIGGER ai_run_logs_change_delete
AFTER DELETE ON ai_run_logs
BEGIN
  INSERT INTO sync_change_counters (scope_kind, scope_id, last_cursor)
  VALUES ('global', 'public', 1)
  ON CONFLICT (scope_kind, scope_id) DO UPDATE
    SET last_cursor = last_cursor + 1;
  INSERT INTO sync_change_feed (
    scope_kind, scope_id, cursor, entity_type, entity_id, revision, change_type
  )
  SELECT 'global', 'public', last_cursor, 'ai_run',
    OLD.run_id, OLD.revision + 1, 'delete'
  FROM sync_change_counters
  WHERE scope_kind = 'global' AND scope_id = 'public';
END;
