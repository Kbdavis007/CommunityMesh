CREATE TABLE coding_agent_profiles (
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('platform', 'hub')),
  scope_id TEXT NOT NULL CHECK (length(trim(scope_id)) > 0),
  profile_id TEXT NOT NULL CHECK (length(trim(profile_id)) > 0),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version > 0),
  profile_json TEXT NOT NULL CHECK (
    json_valid(profile_json) AND json_type(profile_json) = 'object'
  ),
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'revoked')),
  created_by TEXT NOT NULL CHECK (length(trim(created_by)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (scope_kind, scope_id, profile_id, version),
  CHECK (
    (scope_kind = 'platform' AND scope_id = 'platform')
    OR (scope_kind = 'hub' AND scope_id <> 'platform')
  )
);

CREATE TABLE coding_skill_versions (
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('platform', 'hub')),
  scope_id TEXT NOT NULL CHECK (length(trim(scope_id)) > 0),
  skill_id TEXT NOT NULL CHECK (length(trim(skill_id)) > 0),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version > 0),
  manifest_json TEXT NOT NULL CHECK (
    json_valid(manifest_json) AND json_type(manifest_json) = 'object'
  ),
  governance_status TEXT NOT NULL
    CHECK (governance_status IN ('draft', 'approved', 'withdrawn')),
  created_by TEXT NOT NULL CHECK (length(trim(created_by)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (scope_kind, scope_id, skill_id, version),
  CHECK (
    (scope_kind = 'platform' AND scope_id = 'platform')
    OR (scope_kind = 'hub' AND scope_id <> 'platform')
  )
);

CREATE TABLE coding_task_records (
  task_id TEXT PRIMARY KEY CHECK (length(trim(task_id)) > 0),
  hub_id TEXT NOT NULL CHECK (length(trim(hub_id)) > 0),
  project_id TEXT NOT NULL CHECK (length(trim(project_id)) > 0),
  repository TEXT NOT NULL CHECK (length(trim(repository)) > 0),
  base_branch TEXT NOT NULL CHECK (length(trim(base_branch)) > 0),
  producer_id TEXT NOT NULL CHECK (length(trim(producer_id)) > 0),
  requested_by TEXT NOT NULL CHECK (length(trim(requested_by)) > 0),
  source_request_id TEXT NOT NULL CHECK (length(trim(source_request_id)) > 0),
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  request_digest TEXT NOT NULL CHECK (length(trim(request_digest)) > 0),
  specialization TEXT NOT NULL CHECK (
    specialization IN ('feature_impl', 'refactor', 'test_writer', 'doc_writer', 'bug_fix')
  ),
  priority INTEGER NOT NULL DEFAULT 50
    CHECK (typeof(priority) = 'integer' AND priority BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN (
      'accepted', 'deferred', 'queued', 'running', 'succeeded',
      'failed', 'blocked', 'cancelled'
    )),
  assignment_generation INTEGER NOT NULL DEFAULT 1
    CHECK (typeof(assignment_generation) = 'integer' AND assignment_generation > 0),
  reassign_count INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(reassign_count) = 'integer' AND reassign_count >= 0),
  deferred_reason TEXT,
  profile_scope_kind TEXT NOT NULL,
  profile_scope_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  profile_version INTEGER NOT NULL CHECK (typeof(profile_version) = 'integer' AND profile_version > 0),
  spec_paths_json TEXT NOT NULL CHECK (
    json_valid(spec_paths_json)
    AND json_type(spec_paths_json) = 'array'
    AND json_array_length(spec_paths_json) > 0
  ),
  result_ref TEXT,
  failure_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  UNIQUE (hub_id, idempotency_key),
  UNIQUE (hub_id, producer_id, source_request_id),
  FOREIGN KEY (profile_scope_kind, profile_scope_id, profile_id, profile_version)
    REFERENCES coding_agent_profiles (scope_kind, scope_id, profile_id, version),
  CHECK (
    (profile_scope_kind = 'platform' AND profile_scope_id = 'platform')
    OR (profile_scope_kind = 'hub' AND profile_scope_id = hub_id)
  )
);

CREATE TABLE coding_task_payloads (
  task_id TEXT PRIMARY KEY REFERENCES coding_task_records (task_id) ON DELETE RESTRICT,
  payload_json TEXT NOT NULL CHECK (
    json_valid(payload_json) AND json_type(payload_json) = 'object'
  ),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE coding_task_skills (
  task_id TEXT NOT NULL REFERENCES coding_task_records (task_id) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version > 0),
  PRIMARY KEY (task_id, skill_id),
  FOREIGN KEY (scope_kind, scope_id, skill_id, version)
    REFERENCES coding_skill_versions (scope_kind, scope_id, skill_id, version),
  CHECK (
    (scope_kind = 'platform' AND scope_id = 'platform')
    OR (scope_kind = 'hub' AND length(trim(scope_id)) > 0)
  )
);

CREATE TABLE coding_task_attempts (
  attempt_id TEXT PRIMARY KEY CHECK (length(trim(attempt_id)) > 0),
  task_id TEXT NOT NULL REFERENCES coding_task_records (task_id) ON DELETE RESTRICT,
  assignment_generation INTEGER NOT NULL
    CHECK (typeof(assignment_generation) = 'integer' AND assignment_generation > 0),
  specialization TEXT NOT NULL CHECK (
    specialization IN ('feature_impl', 'refactor', 'test_writer', 'doc_writer', 'bug_fix')
  ),
  profile_scope_kind TEXT NOT NULL CHECK (profile_scope_kind IN ('platform', 'hub')),
  profile_scope_id TEXT NOT NULL CHECK (length(trim(profile_scope_id)) > 0),
  profile_id TEXT NOT NULL CHECK (length(trim(profile_id)) > 0),
  profile_version INTEGER NOT NULL CHECK (typeof(profile_version) = 'integer' AND profile_version > 0),
  worker_id TEXT NOT NULL CHECK (length(trim(worker_id)) > 0),
  status TEXT NOT NULL CHECK (
    status IN ('claimed', 'running', 'succeeded', 'failed', 'abandoned')
  ),
  claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT,
  finished_at TEXT,
  UNIQUE (task_id, assignment_generation),
  FOREIGN KEY (profile_scope_kind, profile_scope_id, profile_id, profile_version)
    REFERENCES coding_agent_profiles (scope_kind, scope_id, profile_id, version)
);

CREATE TABLE coding_quota_policies (
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('platform', 'hub')),
  scope_id TEXT NOT NULL CHECK (length(trim(scope_id)) > 0),
  dimension_kind TEXT NOT NULL CHECK (dimension_kind IN ('agent', 'user', 'project')),
  subject_id TEXT NOT NULL CHECK (length(trim(subject_id)) > 0),
  max_active_tasks INTEGER NOT NULL
    CHECK (typeof(max_active_tasks) = 'integer' AND max_active_tasks > 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (scope_kind, scope_id, dimension_kind, subject_id),
  CHECK (
    (scope_kind = 'platform' AND scope_id = 'platform')
    OR (scope_kind = 'hub' AND scope_id <> 'platform')
  )
);

CREATE TABLE coding_quota_reservations (
  task_id TEXT NOT NULL REFERENCES coding_task_records (task_id) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  dimension_kind TEXT NOT NULL CHECK (dimension_kind IN ('agent', 'user', 'project')),
  subject_id TEXT NOT NULL CHECK (length(trim(subject_id)) > 0),
  reserved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  released_at TEXT,
  PRIMARY KEY (task_id, scope_kind, scope_id, dimension_kind),
  FOREIGN KEY (scope_kind, scope_id, dimension_kind, subject_id)
    REFERENCES coding_quota_policies (scope_kind, scope_id, dimension_kind, subject_id)
);

CREATE TABLE coding_worker_health_policies (
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('platform', 'hub')),
  scope_id TEXT NOT NULL CHECK (length(trim(scope_id)) > 0),
  specialization TEXT NOT NULL CHECK (
    specialization IN ('feature_impl', 'refactor', 'test_writer', 'doc_writer', 'bug_fix')
  ),
  window_seconds INTEGER NOT NULL
    CHECK (typeof(window_seconds) = 'integer' AND window_seconds > 0),
  minimum_attempts INTEGER NOT NULL DEFAULT 5
    CHECK (typeof(minimum_attempts) = 'integer' AND minimum_attempts > 0),
  max_reassignments INTEGER NOT NULL DEFAULT 3
    CHECK (typeof(max_reassignments) = 'integer' AND max_reassignments > 0),
  max_failure_rate_basis_points INTEGER NOT NULL
    CHECK (typeof(max_failure_rate_basis_points) = 'integer'
      AND max_failure_rate_basis_points BETWEEN 0 AND 10000),
  stale_task_seconds INTEGER NOT NULL
    CHECK (typeof(stale_task_seconds) = 'integer' AND stale_task_seconds > 0),
  max_backlog INTEGER NOT NULL
    CHECK (typeof(max_backlog) = 'integer' AND max_backlog > 0),
  PRIMARY KEY (scope_kind, scope_id, specialization),
  CHECK (
    (scope_kind = 'platform' AND scope_id = 'platform')
    OR (scope_kind = 'hub' AND scope_id <> 'platform')
  )
);

CREATE UNIQUE INDEX coding_task_attempts_active_task_idx
  ON coding_task_attempts (task_id)
  WHERE status IN ('claimed', 'running');

CREATE TABLE coding_task_events (
  event_id TEXT PRIMARY KEY CHECK (length(trim(event_id)) > 0),
  task_id TEXT NOT NULL REFERENCES coding_task_records (task_id) ON DELETE RESTRICT,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN (
    'accepted', 'deferred', 'queued', 'running', 'succeeded',
    'failed', 'blocked', 'cancelled'
  )),
  to_status TEXT CHECK (to_status IS NULL OR to_status IN (
    'accepted', 'deferred', 'queued', 'running', 'succeeded',
    'failed', 'blocked', 'cancelled'
  )),
  event_type TEXT NOT NULL CHECK (length(trim(event_type)) > 0),
  actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) > 0),
  reason TEXT,
  details_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details_json) AND json_type(details_json) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE coding_audit_events (
  audit_id TEXT PRIMARY KEY CHECK (length(trim(audit_id)) > 0),
  task_id TEXT REFERENCES coding_task_records (task_id) ON DELETE RESTRICT,
  hub_id TEXT NOT NULL CHECK (length(trim(hub_id)) > 0),
  actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) > 0),
  policy_key TEXT,
  action TEXT NOT NULL CHECK (length(trim(action)) > 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied', 'success', 'failure')),
  details_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details_json) AND json_type(details_json) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX coding_task_records_status_priority_idx
  ON coding_task_records (status, priority DESC, created_at);
CREATE INDEX coding_task_records_hub_status_idx
  ON coding_task_records (hub_id, status, created_at);
CREATE INDEX coding_agent_profiles_scope_status_idx
  ON coding_agent_profiles (scope_kind, scope_id, status);
CREATE INDEX coding_skill_versions_scope_status_idx
  ON coding_skill_versions (scope_kind, scope_id, governance_status);
CREATE INDEX coding_task_attempts_task_idx
  ON coding_task_attempts (task_id, assignment_generation);
CREATE INDEX coding_task_attempts_health_idx
  ON coding_task_attempts (specialization, claimed_at, status);
CREATE INDEX coding_quota_reservations_active_idx
  ON coding_quota_reservations (scope_kind, scope_id, dimension_kind, subject_id)
  WHERE released_at IS NULL;
CREATE INDEX coding_worker_health_policies_scope_idx
  ON coding_worker_health_policies (scope_kind, scope_id, specialization);
CREATE INDEX coding_task_events_task_idx
  ON coding_task_events (task_id, created_at);
CREATE INDEX coding_audit_events_task_idx
  ON coding_audit_events (hub_id, task_id, created_at);

CREATE TRIGGER coding_task_profile_must_be_approved_insert
BEFORE INSERT ON coding_task_records
WHEN NOT EXISTS (
  SELECT 1 FROM coding_agent_profiles
  WHERE scope_kind = NEW.profile_scope_kind
    AND scope_id = NEW.profile_scope_id
    AND profile_id = NEW.profile_id
    AND version = NEW.profile_version
    AND status = 'approved'
)
BEGIN
  SELECT RAISE(ABORT, 'coding task profile is not approved');
END;

CREATE TRIGGER coding_task_profile_must_be_approved_update
BEFORE UPDATE OF profile_scope_kind, profile_scope_id, profile_id, profile_version
ON coding_task_records
WHEN NOT EXISTS (
  SELECT 1 FROM coding_agent_profiles
  WHERE scope_kind = NEW.profile_scope_kind
    AND scope_id = NEW.profile_scope_id
    AND profile_id = NEW.profile_id
    AND version = NEW.profile_version
    AND status = 'approved'
)
BEGIN
  SELECT RAISE(ABORT, 'coding task profile is not approved');
END;

CREATE TRIGGER coding_task_skill_must_be_approved_insert
BEFORE INSERT ON coding_task_skills
WHEN NOT EXISTS (
  SELECT 1 FROM coding_skill_versions
  WHERE scope_kind = NEW.scope_kind
    AND scope_id = NEW.scope_id
    AND skill_id = NEW.skill_id
    AND version = NEW.version
    AND governance_status = 'approved'
    AND (scope_kind = 'platform' OR scope_id = (
      SELECT hub_id FROM coding_task_records WHERE task_id = NEW.task_id
    ))
)
BEGIN
  SELECT RAISE(ABORT, 'coding task skill is not approved for this hub');
END;

CREATE TRIGGER coding_task_status_transition
BEFORE UPDATE OF status ON coding_task_records
WHEN NEW.status <> OLD.status AND NOT (
  (OLD.status = 'accepted' AND NEW.status IN ('deferred', 'queued', 'blocked', 'cancelled'))
  OR (OLD.status = 'deferred' AND NEW.status IN ('queued', 'blocked', 'cancelled'))
  OR (OLD.status = 'queued' AND NEW.status IN ('running', 'deferred', 'blocked', 'cancelled'))
  OR (OLD.status = 'running' AND NEW.status IN (
    'queued', 'deferred', 'succeeded', 'failed', 'blocked', 'cancelled'
  ))
  OR (OLD.status = 'blocked' AND NEW.status IN ('queued', 'cancelled'))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid coding task status transition');
END;

CREATE TRIGGER coding_task_generation_cannot_decrease
BEFORE UPDATE OF assignment_generation ON coding_task_records
WHEN NEW.assignment_generation < OLD.assignment_generation
BEGIN
  SELECT RAISE(ABORT, 'coding task assignment generation cannot decrease');
END;

CREATE TRIGGER coding_task_reassign_count_cannot_decrease
BEFORE UPDATE OF reassign_count ON coding_task_records
WHEN NEW.reassign_count < OLD.reassign_count
BEGIN
  SELECT RAISE(ABORT, 'coding task reassignment count cannot decrease');
END;

CREATE TRIGGER coding_task_release_quotas
AFTER UPDATE OF status ON coding_task_records
WHEN NEW.status IN ('deferred', 'succeeded', 'failed', 'blocked', 'cancelled')
BEGIN
  UPDATE coding_quota_reservations
  SET released_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE task_id = NEW.task_id AND released_at IS NULL;
END;

CREATE TRIGGER coding_task_payload_terminal_cleanup
AFTER UPDATE OF status ON coding_task_records
WHEN NEW.status IN ('succeeded', 'failed', 'blocked', 'cancelled')
BEGIN
  DELETE FROM coding_task_payloads WHERE task_id = NEW.task_id;
END;

CREATE TRIGGER coding_quota_reservation_scope
BEFORE INSERT ON coding_quota_reservations
WHEN NOT EXISTS (
  SELECT 1 FROM coding_task_records
  WHERE task_id = NEW.task_id
    AND (
      (NEW.scope_kind = 'platform' AND NEW.scope_id = 'platform')
      OR (NEW.scope_kind = 'hub' AND NEW.scope_id = hub_id)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'coding quota reservation crosses hub scope');
END;

CREATE TRIGGER coding_task_attempt_current_generation
BEFORE INSERT ON coding_task_attempts
WHEN NOT EXISTS (
  SELECT 1 FROM coding_task_records
  WHERE task_id = NEW.task_id
    AND assignment_generation = NEW.assignment_generation
    AND status IN ('queued', 'running')
)
BEGIN
  SELECT RAISE(ABORT, 'coding task attempt has a stale assignment generation');
END;

CREATE TRIGGER coding_agent_profile_definition_immutable
BEFORE UPDATE OF scope_kind, scope_id, profile_id, version, profile_json
ON coding_agent_profiles
BEGIN
  SELECT RAISE(ABORT, 'coding agent profile versions are immutable');
END;

CREATE TRIGGER coding_agent_profile_version_cannot_be_deleted
BEFORE DELETE ON coding_agent_profiles
BEGIN
  SELECT RAISE(ABORT, 'coding agent profile versions cannot be deleted');
END;

CREATE TRIGGER coding_skill_version_definition_immutable
BEFORE UPDATE OF scope_kind, scope_id, skill_id, version, manifest_json
ON coding_skill_versions
BEGIN
  SELECT RAISE(ABORT, 'coding skill versions are immutable');
END;

CREATE TRIGGER coding_skill_version_cannot_be_deleted
BEFORE DELETE ON coding_skill_versions
BEGIN
  SELECT RAISE(ABORT, 'coding skill versions cannot be deleted');
END;

CREATE TRIGGER coding_task_events_immutable_update
BEFORE UPDATE ON coding_task_events
BEGIN
  SELECT RAISE(ABORT, 'coding task events are immutable');
END;

CREATE TRIGGER coding_task_events_immutable_delete
BEFORE DELETE ON coding_task_events
BEGIN
  SELECT RAISE(ABORT, 'coding task events are immutable');
END;

CREATE TRIGGER coding_audit_events_immutable_update
BEFORE UPDATE ON coding_audit_events
BEGIN
  SELECT RAISE(ABORT, 'coding audit events are immutable');
END;

CREATE TRIGGER coding_audit_events_immutable_delete
BEFORE DELETE ON coding_audit_events
BEGIN
  SELECT RAISE(ABORT, 'coding audit events are immutable');
END;
