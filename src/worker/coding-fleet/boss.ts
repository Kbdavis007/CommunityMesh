import {
  InvalidCodingRequestError,
  parseCodingRequestMessage,
  parseCodingTaskMessage,
  type CodingAlertMessage,
  type CodingRequestKind,
  type CodingRequestMessage,
  type CodingTaskMessage,
} from "./contracts";
import {
  OpenSpecResolutionError,
  resolveOpenSpecArtifacts,
} from "./spec-resolver";
import {
  AgentProfileConfigurationError,
  assertHubProfileWithinBaseline,
  isAgentPathAllowed,
  parseAgentProfileConfiguration,
  type AgentProfileConfiguration,
} from "./agent-governance";

interface StoredTask {
  task_id: string;
  hub_id: string;
  project_id: string;
  repository: string;
  base_branch: string;
  producer_id: string;
  source_request_id: string;
  requested_by: string;
  idempotency_key: string;
  specialization: CodingTaskMessage["specialization"];
  priority: number;
  assignment_generation: number;
  reassign_count: number;
  status: string;
  profile_scope_kind: "platform" | "hub";
  profile_scope_id: string;
  profile_id: string;
  profile_version: number;
  spec_paths_json: string;
  payload_json: string | null;
}

interface AgentProfileRow {
  scope_kind: "platform" | "hub";
  scope_id: string;
  profile_id: string;
  version: number;
  profile_json: string;
}

interface SkillRow {
  scope_kind: "platform" | "hub";
  scope_id: string;
  skill_id: string;
  version: number;
}

interface QuotaPolicyRow {
  scope_kind: "platform" | "hub";
  scope_id: string;
  dimension_kind: "agent" | "user" | "project";
  subject_id: string;
  max_active_tasks: number;
}

interface HealthPolicyRow {
  scope_kind: "platform" | "hub";
  scope_id: string;
  specialization: CodingTaskMessage["specialization"];
  window_seconds: number;
  minimum_attempts: number;
  max_reassignments: number;
  max_failure_rate_basis_points: number;
  stale_task_seconds: number;
  max_backlog: number;
}

interface SkillReference {
  scopeKind: "platform" | "hub";
  scopeId: string;
  skillId: string;
  version: number;
}

export class CodingBossError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CodingBossError";
  }
}

const specializationByKind: Record<CodingRequestKind, CodingTaskMessage["specialization"]> = {
  feature: "feature_impl",
  refactor: "refactor",
  test: "test_writer",
  documentation: "doc_writer",
  bug: "bug_fix",
};

async function loadAgentProfileConfiguration(
  env: Env,
  profile: AgentProfileRow,
  hubId: string,
): Promise<AgentProfileConfiguration> {
  let jsonValue: unknown;
  try {
    jsonValue = JSON.parse(profile.profile_json);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CodingBossError("invalid_profile", "An approved agent profile contains invalid JSON.");
    }
    throw error;
  }

  let configuration: AgentProfileConfiguration;
  try {
    configuration = parseAgentProfileConfiguration(
      jsonValue,
      hubId,
      profile.scope_kind,
    );
  } catch (error) {
    if (error instanceof AgentProfileConfigurationError) {
      throw new CodingBossError(error.code, error.message);
    }
    throw error;
  }

  if (profile.scope_kind === "platform") return configuration;
  const baselineReference = configuration.baselineProfile;
  if (baselineReference === undefined) {
    throw new CodingBossError(
      "invalid_profile",
      "The hub profile does not reference a platform baseline.",
    );
  }
  const baseline = await env.DB.prepare(`
    SELECT scope_kind, scope_id, profile_id, version, profile_json
    FROM coding_agent_profiles
    WHERE scope_kind = 'platform' AND scope_id = 'platform'
      AND profile_id = ?1 AND version = ?2 AND status = 'approved'
  `).bind(baselineReference.profileId, baselineReference.version)
    .first<AgentProfileRow>();
  if (baseline === null) {
    throw new CodingBossError(
      "profile_baseline_unavailable",
      "The hub profile's referenced platform baseline is missing or unapproved.",
    );
  }

  let baselineJson: unknown;
  try {
    baselineJson = JSON.parse(baseline.profile_json);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CodingBossError("invalid_profile", "The platform baseline contains invalid JSON.");
    }
    throw error;
  }
  let baselineConfiguration: AgentProfileConfiguration;
  try {
    baselineConfiguration = parseAgentProfileConfiguration(
      baselineJson,
      hubId,
      "platform",
    );
    assertHubProfileWithinBaseline(configuration, baselineConfiguration);
  } catch (error) {
    if (error instanceof AgentProfileConfigurationError) {
      throw new CodingBossError(error.code, error.message);
    }
    throw error;
  }
  return configuration;
}

async function findCompatibleProfile(
  env: Env,
  hubId: string,
  specialization: CodingTaskMessage["specialization"],
  options: {
    excludeProfileId?: string;
    excludeTaskId?: string;
    requiredSpecPaths?: string[];
  } = {},
): Promise<{
  profile: AgentProfileRow;
  skills: SkillReference[];
  configuration: AgentProfileConfiguration;
}> {
  const result = await env.DB.prepare(`
    SELECT scope_kind, scope_id, profile_id, version, profile_json
    FROM coding_agent_profiles
    WHERE status = 'approved'
      AND ((scope_kind = 'hub' AND scope_id = ?1)
        OR (scope_kind = 'platform' AND scope_id = 'platform'))
    ORDER BY CASE WHEN scope_kind = 'hub' THEN 0 ELSE 1 END, version DESC
  `).bind(hubId).all<AgentProfileRow>();
  if (!result.success) {
    throw new CodingBossError("profile_lookup_failed", "Could not load approved agent profiles.");
  }

  const compatible: Array<{
    profile: AgentProfileRow;
    skills: SkillReference[];
    configuration: AgentProfileConfiguration;
  }> = [];
  let specPathRejected = false;
  let readOperationRejected = false;
  for (const profile of result.results) {
    const configuration = await loadAgentProfileConfiguration(env, profile, hubId);
    if (!configuration.taskTypes.includes(specialization)) continue;
    if (!configuration.allowedOperations.includes("read")) {
      readOperationRejected = true;
      continue;
    }
    if (
      options.requiredSpecPaths !== undefined
      && !options.requiredSpecPaths.every((path) =>
        isAgentPathAllowed(path, configuration.allowedSpecPaths)
      )
    ) {
      specPathRejected = true;
      continue;
    }

    for (const skill of configuration.requiredSkills) {
      const approved = await env.DB.prepare(`
        SELECT 1 AS approved
        FROM coding_skill_versions
        WHERE scope_kind = ?1 AND scope_id = ?2 AND skill_id = ?3
          AND version = ?4 AND governance_status = 'approved'
      `).bind(
        skill.scopeKind,
        skill.scopeId,
        skill.skillId,
        skill.version,
      ).first<{ approved: number }>();
      if (approved === null) {
        throw new CodingBossError(
          "required_skill_unavailable",
          `Required skill ${skill.skillId}@${skill.version} is not approved.`,
        );
      }
    }

    compatible.push({ profile, skills: configuration.requiredSkills, configuration });
  }

  const hubProfiles = compatible.filter(({ profile }) => profile.scope_kind === "hub");
  const candidates = hubProfiles.length > 0
    ? hubProfiles
    : compatible.filter(({ profile }) => profile.scope_kind === "platform");
  if (candidates.length === 0) {
    if (readOperationRejected) {
      throw new CodingBossError(
        "operation_not_permitted",
        "No compatible agent profile permits reading the task specifications.",
      );
    }
    if (specPathRejected) {
      throw new CodingBossError(
        "spec_path_not_permitted",
        "No compatible agent profile allows all resolved OpenSpec paths.",
      );
    }
    throw new CodingBossError(
      "profile_unavailable",
      `No approved agent profile supports ${specialization} for hub ${hubId}.`,
    );
  }

  let overloadedCandidate: typeof candidates[number] | undefined;
  for (const candidate of candidates) {
    const candidateKey = [
      candidate.profile.scope_kind,
      candidate.profile.scope_id,
      candidate.profile.profile_id,
    ].join(":");
    if (candidateKey === options.excludeProfileId) continue;
    const subjectId = [
      candidate.profile.scope_kind,
      candidate.profile.scope_id,
      candidate.profile.profile_id,
    ].join(":");
    const policies = await loadQuotaPolicies(env, hubId, [
      { dimension: "agent", subjectId },
    ]);
    if (overloadedCandidate === undefined) overloadedCandidate = candidate;
    if (await hasQuotaCapacity(env, policies, options.excludeTaskId)) {
      return candidate;
    }
  }

  if (overloadedCandidate === undefined) {
    throw new CodingBossError(
      "profile_unavailable",
      `No approved agent profile supports ${specialization} for hub ${hubId}.`,
    );
  }
  return overloadedCandidate;
}

async function loadQuotaPolicies(
  env: Env,
  hubId: string,
  dimensions: Array<{
    dimension: QuotaPolicyRow["dimension_kind"];
    subjectId: string;
  }>,
): Promise<QuotaPolicyRow[]> {
  const policies: QuotaPolicyRow[] = [];
  for (const scope of [
    { kind: "hub" as const, id: hubId },
    { kind: "platform" as const, id: "platform" },
  ]) {
    for (const dimension of dimensions) {
      const policy = await env.DB.prepare(`
        SELECT scope_kind, scope_id, dimension_kind, subject_id, max_active_tasks
        FROM coding_quota_policies
        WHERE scope_kind = ?1 AND scope_id = ?2
          AND dimension_kind = ?3 AND subject_id = ?4
      `).bind(scope.kind, scope.id, dimension.dimension, dimension.subjectId)
        .first<QuotaPolicyRow>();
      if (policy !== null) policies.push(policy);
    }
  }
  return policies;
}

async function hasQuotaCapacity(
  env: Env,
  policies: QuotaPolicyRow[],
  excludeTaskId?: string,
): Promise<boolean> {
  for (const policy of policies) {
    const active = await env.DB.prepare(`
      SELECT COUNT(*) AS active_count
      FROM coding_quota_reservations
      WHERE scope_kind = ?1 AND scope_id = ?2
        AND dimension_kind = ?3 AND subject_id = ?4
        AND released_at IS NULL
        AND (?5 IS NULL OR task_id <> ?5)
    `).bind(
      policy.scope_kind,
      policy.scope_id,
      policy.dimension_kind,
      policy.subject_id,
      excludeTaskId ?? null,
    ).first<{ active_count: number }>();
    if (active !== null && active.active_count >= policy.max_active_tasks) {
      return false;
    }
  }
  return true;
}

function parseStringArray(json: string, fieldName: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CodingBossError("invalid_task_record", `Stored ${fieldName} is invalid JSON.`);
    }
    throw error;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new CodingBossError("invalid_task_record", `Stored ${fieldName} is not a string array.`);
  }
  return value;
}

async function loadStoredTaskMessage(env: Env, task: StoredTask): Promise<CodingTaskMessage> {
  const skills = await env.DB.prepare(`
    SELECT scope_kind, scope_id, skill_id, version
    FROM coding_task_skills
    WHERE task_id = ?1
    ORDER BY skill_id
  `).bind(task.task_id).all<SkillRow>();
  if (!skills.success) {
    throw new CodingBossError("task_lookup_failed", "Could not load task skill references.");
  }

  if (task.payload_json === null) {
    throw new CodingBossError("task_payload_missing", "The active coding task payload is missing.");
  }
  let payload: CodingRequestMessage;
  try {
    payload = parseCodingRequestMessage(JSON.parse(task.payload_json));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CodingBossError("invalid_task_record", "The stored coding task payload is invalid JSON.");
    }
    if (error instanceof InvalidCodingRequestError) {
      throw new CodingBossError("invalid_task_record", "The stored coding task payload is malformed.");
    }
    throw error;
  }
  if (
    payload.hubId !== task.hub_id
    || payload.projectId !== task.project_id
    || payload.producerId !== task.producer_id
    || payload.actorId !== task.requested_by
    || payload.requestId !== task.source_request_id
    || payload.idempotencyKey !== task.idempotency_key
  ) {
    throw new CodingBossError("invalid_task_record", "Stored task payload attribution does not match D1.");
  }

  return parseCodingTaskMessage({
    version: 1,
    taskId: task.task_id,
    requestId: task.source_request_id,
    hubId: task.hub_id,
    projectId: task.project_id,
    repository: task.repository,
    baseBranch: task.base_branch,
    request: {
      kind: payload.kind,
      title: payload.title,
      description: payload.description,
    },
    specialization: task.specialization,
    priority: task.priority,
    assignmentGeneration: task.assignment_generation,
    specPaths: parseStringArray(task.spec_paths_json, "spec paths"),
    profile: {
      scopeKind: task.profile_scope_kind,
      scopeId: task.profile_scope_id,
      profileId: task.profile_id,
      version: task.profile_version,
    },
    skills: skills.results.map((skill) => ({
      scopeKind: skill.scope_kind,
      scopeId: skill.scope_id,
      skillId: skill.skill_id,
      version: skill.version,
    })),
  });
}

async function sendAlert(
  env: Env,
  code: string,
  message: string,
  hubId?: string,
): Promise<void> {
  const alert: CodingAlertMessage = {
    version: 1,
    alertId: crypto.randomUUID(),
    ...(hubId === undefined ? {} : { hubId }),
    severity: "high",
    code,
    message,
    occurredAt: new Date().toISOString(),
  };
  await env.CODING_ALERTS_QUEUE.send(alert);
}

async function enqueueAcceptedTask(env: Env, task: StoredTask): Promise<void> {
  const message = await loadStoredTaskMessage(env, task);
  await env.CODING_TASKS_QUEUE.send(message);
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE coding_task_records
      SET status = 'queued',
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE task_id = ?1 AND status = 'accepted'
    `).bind(task.task_id),
    env.DB.prepare(`
      INSERT OR IGNORE INTO coding_task_events (
        event_id, task_id, from_status, to_status, event_type, actor_id, details_json
      ) VALUES (?1, ?2, 'accepted', 'queued', 'task_dispatched', 'boss_coding_worker', '{}')
    `).bind(`task:${task.task_id}:queued`, task.task_id),
  ]);
}

async function findExistingTask(
  env: Env,
  message: CodingRequestMessage,
): Promise<StoredTask | null> {
  return env.DB.prepare(`
    SELECT record.task_id, record.hub_id, record.project_id, record.source_request_id,
      record.repository, record.base_branch, record.specialization, record.priority,
      record.assignment_generation, record.status, record.profile_scope_kind,
      record.profile_scope_id, record.profile_id, record.profile_version,
      record.spec_paths_json, record.reassign_count, record.producer_id,
      record.requested_by, record.idempotency_key, payload.payload_json
    FROM coding_task_records AS record
    LEFT JOIN coding_task_payloads AS payload ON payload.task_id = record.task_id
    WHERE record.hub_id = ?1 AND record.idempotency_key = ?2
  `).bind(message.hubId, message.idempotencyKey).first<StoredTask>();
}

async function persistTask(
  env: Env,
  message: CodingRequestMessage,
  task: CodingTaskMessage,
  requestDigest: string,
  quotaPolicies: QuotaPolicyRow[],
): Promise<{ created: boolean; deferredByQuota: boolean }> {
  const statements = [
    env.DB.prepare(`
      INSERT INTO coding_task_records (
        task_id, hub_id, project_id, repository, base_branch, producer_id,
        requested_by, source_request_id, idempotency_key, request_digest,
        specialization, priority,
        profile_scope_kind, profile_scope_id, profile_id, profile_version,
        spec_paths_json
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
        ?15, ?16, ?17
      )
      ON CONFLICT (hub_id, idempotency_key) DO NOTHING
    `).bind(
      task.taskId,
      message.hubId,
      message.projectId,
      message.repository,
      message.baseBranch,
      message.producerId,
      message.actorId,
      message.requestId,
      message.idempotencyKey,
      requestDigest,
      task.specialization,
      task.priority,
      task.profile.scopeKind,
      task.profile.scopeId,
      task.profile.profileId,
      task.profile.version,
      JSON.stringify(task.specPaths),
    ),
    ...task.skills.map((skill) =>
      env.DB.prepare(`
        INSERT INTO coding_task_skills (task_id, scope_kind, scope_id, skill_id, version)
        SELECT ?1, ?2, ?3, ?4, ?5
        WHERE EXISTS (
          SELECT 1 FROM coding_task_records
          WHERE task_id = ?6 AND status = 'accepted'
        )
      `).bind(
        task.taskId,
        skill.scopeKind,
        skill.scopeId,
        skill.skillId,
        skill.version,
        task.taskId,
      ),
    ),
    env.DB.prepare(`
      INSERT INTO coding_task_payloads (task_id, payload_json)
      SELECT ?1, ?2
      WHERE EXISTS (
        SELECT 1 FROM coding_task_records
        WHERE task_id = ?1 AND status = 'accepted'
      )
    `).bind(task.taskId, JSON.stringify(message)),
    env.DB.prepare(`
      INSERT OR IGNORE INTO coding_task_events (
        event_id, task_id, to_status, event_type, actor_id, details_json
      )
      SELECT ?1, ?2, 'accepted', 'task_accepted', 'boss_coding_worker', '{}'
      WHERE EXISTS (
        SELECT 1 FROM coding_task_records
        WHERE task_id = ?2 AND status = 'accepted'
      )
    `).bind(`task:${task.taskId}:accepted`, task.taskId),
    ...quotaPolicies.map((policy) =>
      env.DB.prepare(`
        INSERT INTO coding_quota_reservations (
          task_id, scope_kind, scope_id, dimension_kind, subject_id
        )
        SELECT ?1, ?2, ?3, ?4, ?5
        WHERE EXISTS (
          SELECT 1 FROM coding_task_records
          WHERE task_id = ?1 AND status = 'accepted'
        )
          AND (
            SELECT COUNT(*) FROM coding_quota_reservations
            WHERE scope_kind = ?2 AND scope_id = ?3
              AND dimension_kind = ?4 AND subject_id = ?5
              AND released_at IS NULL
          ) < (
            SELECT max_active_tasks FROM coding_quota_policies
            WHERE scope_kind = ?2 AND scope_id = ?3
              AND dimension_kind = ?4 AND subject_id = ?5
          )
        ON CONFLICT (task_id, scope_kind, scope_id, dimension_kind) DO NOTHING
      `).bind(
        task.taskId,
        policy.scope_kind,
        policy.scope_id,
        policy.dimension_kind,
        policy.subject_id,
      ),
    ),
    ...quotaPolicies.map((policy) =>
      env.DB.prepare(`
        UPDATE coding_task_records
        SET status = 'deferred', deferred_reason = 'quota_exceeded',
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE task_id = ?1 AND status = 'accepted'
          AND NOT EXISTS (
            SELECT 1 FROM coding_quota_reservations
            WHERE task_id = ?1 AND scope_kind = ?2 AND scope_id = ?3
              AND dimension_kind = ?4 AND subject_id = ?5
              AND released_at IS NULL
          )
          AND (
            SELECT COUNT(*) FROM coding_quota_reservations
            WHERE scope_kind = ?2 AND scope_id = ?3
              AND dimension_kind = ?4 AND subject_id = ?5
              AND released_at IS NULL
          ) >= (
            SELECT max_active_tasks FROM coding_quota_policies
            WHERE scope_kind = ?2 AND scope_id = ?3
              AND dimension_kind = ?4 AND subject_id = ?5
          )
      `).bind(
        task.taskId,
        policy.scope_kind,
        policy.scope_id,
        policy.dimension_kind,
        policy.subject_id,
      ),
    ),
    env.DB.prepare(`
      INSERT OR IGNORE INTO coding_task_events (
        event_id, task_id, from_status, to_status, event_type,
        actor_id, reason, details_json
      )
      SELECT ?1, ?2, 'accepted', 'deferred', 'quota_deferred',
        'boss_coding_worker', 'quota_exceeded', '{}'
      WHERE EXISTS (
        SELECT 1 FROM coding_task_records
        WHERE task_id = ?2 AND status = 'deferred'
      )
    `).bind(`task:${task.taskId}:deferred`, task.taskId),
  ];

  const results = await env.DB.batch(statements);
  const created = (results[0]?.meta.changes ?? 0) > 0;
  if (!created) return { created, deferredByQuota: false };

  const persistedTask = await env.DB.prepare(
    "SELECT status FROM coding_task_records WHERE task_id = ?1",
  ).bind(task.taskId).first<{ status: string }>();
  const deferredByQuota = persistedTask?.status === "deferred";
  return { created, deferredByQuota };
}

async function requestDigest(message: CodingRequestMessage): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(message)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function loadHealthPolicies(env: Env): Promise<HealthPolicyRow[]> {
  const result = await env.DB.prepare(`
    SELECT scope_kind, scope_id, specialization, window_seconds,
      minimum_attempts, max_reassignments, max_failure_rate_basis_points,
      stale_task_seconds, max_backlog
    FROM coding_worker_health_policies
    ORDER BY CASE WHEN scope_kind = 'hub' THEN 0 ELSE 1 END
  `).all<HealthPolicyRow>();
  if (!result.success) {
    throw new CodingBossError("health_policy_lookup_failed", "Could not load fleet health policies.");
  }
  return result.results;
}

function policyForTask(
  policies: HealthPolicyRow[],
  hubId: string,
  specialization: CodingTaskMessage["specialization"],
): HealthPolicyRow | undefined {
  return policies.find((policy) =>
    policy.specialization === specialization
    && policy.scope_kind === "hub"
    && policy.scope_id === hubId
  ) ?? policies.find((policy) =>
    policy.specialization === specialization
    && policy.scope_kind === "platform"
    && policy.scope_id === "platform"
  );
}

async function deferStaleTask(
  env: Env,
  task: StoredTask,
  reason: string,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE coding_task_attempts
      SET status = 'abandoned',
          finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE task_id = ?1 AND assignment_generation = ?2
        AND status IN ('claimed', 'running')
    `).bind(task.task_id, task.assignment_generation),
    env.DB.prepare(`
      UPDATE coding_task_records
      SET status = 'deferred', deferred_reason = ?2,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE task_id = ?1 AND status IN ('queued', 'running')
    `).bind(task.task_id, reason),
    env.DB.prepare(`
      INSERT OR IGNORE INTO coding_task_events (
        event_id, task_id, from_status, to_status, event_type,
        actor_id, reason, details_json
      )
      SELECT ?1, ?2, 'running', 'deferred', 'task_deferred',
        'boss_coding_worker', ?3, '{}'
      WHERE EXISTS (
        SELECT 1 FROM coding_task_records
        WHERE task_id = ?2 AND status = 'deferred'
      )
    `).bind(`task:${task.task_id}:deferred:${task.assignment_generation}`, task.task_id, reason),
  ]);
}

async function retryOrReassignTask(
  env: Env,
  task: StoredTask,
  maxReassignments: number,
  excludeCurrentProfile: boolean,
): Promise<boolean> {
  if (task.reassign_count >= maxReassignments) {
    await deferStaleTask(env, task, "reassignment_limit_reached");
    await sendAlert(
      env,
      "reassignment_limit_reached",
      `Task ${task.task_id} reached its configured reassignment limit.`,
      task.hub_id,
    );
    return false;
  }

  let selected: { profile: AgentProfileRow; skills: SkillReference[] };
  try {
    selected = await findCompatibleProfile(
      env,
      task.hub_id,
      task.specialization,
      {
        ...(excludeCurrentProfile
          ? {
              excludeProfileId: [
                task.profile_scope_kind,
                task.profile_scope_id,
                task.profile_id,
              ].join(":"),
            }
          : {}),
        excludeTaskId: task.task_id,
        requiredSpecPaths: parseStringArray(task.spec_paths_json, "spec paths"),
      },
    );
  } catch (error) {
    if (
      error instanceof CodingBossError
      && [
        "profile_unavailable",
        "profile_baseline_unavailable",
        "profile_exceeds_baseline",
        "required_skill_unavailable",
        "invalid_profile",
      ]
        .includes(error.code)
    ) {
      if (task.status !== "deferred") {
        await deferStaleTask(env, task, "no_eligible_reassignment_profile");
      }
      await sendAlert(
        env,
        error.code,
        `Task ${task.task_id} could not be reassigned: ${error.message}`,
        task.hub_id,
      );
      return false;
    }
    throw error;
  }
  const agentSubject = [
    selected.profile.scope_kind,
    selected.profile.scope_id,
    selected.profile.profile_id,
  ].join(":");
  const quotaPolicies = await loadQuotaPolicies(env, task.hub_id, [
    { dimension: "agent", subjectId: agentSubject },
    { dimension: "user", subjectId: task.requested_by },
    { dimension: "project", subjectId: task.project_id },
  ]);
  if (!(await hasQuotaCapacity(env, quotaPolicies, task.task_id))) {
    if (task.status !== "deferred") {
      await deferStaleTask(env, task, "quota_exceeded");
      await sendAlert(
        env,
        "quota_exceeded",
        `Stale task ${task.task_id} was deferred because its quota is full.`,
        task.hub_id,
      );
    }
    return false;
  }

  const storedMessage = await loadStoredTaskMessage(env, task);
  const nextGeneration = task.assignment_generation + 1;
  const reassignedMessage = parseCodingTaskMessage({
    ...storedMessage,
    assignmentGeneration: nextGeneration,
    profile: {
      scopeKind: selected.profile.scope_kind,
      scopeId: selected.profile.scope_id,
      profileId: selected.profile.profile_id,
      version: selected.profile.version,
    },
    skills: selected.skills,
  });
  const statements = [
    env.DB.prepare(`
      UPDATE coding_task_attempts
      SET status = 'abandoned',
          finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE task_id = ?1 AND assignment_generation = ?2
        AND status IN ('claimed', 'running')
    `).bind(task.task_id, task.assignment_generation),
    env.DB.prepare(`
      UPDATE coding_quota_reservations
      SET released_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE task_id = ?1 AND released_at IS NULL
    `).bind(task.task_id),
    env.DB.prepare(`
      UPDATE coding_task_records
      SET status = 'queued', deferred_reason = NULL,
          assignment_generation = ?2, reassign_count = reassign_count + 1,
          profile_scope_kind = ?3, profile_scope_id = ?4,
          profile_id = ?5, profile_version = ?6,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE task_id = ?1 AND status IN ('queued', 'running', 'deferred')
        AND reassign_count < ?7
    `).bind(
      task.task_id,
      nextGeneration,
      selected.profile.scope_kind,
      selected.profile.scope_id,
      selected.profile.profile_id,
      selected.profile.version,
      maxReassignments,
    ),
    env.DB.prepare("DELETE FROM coding_task_skills WHERE task_id = ?1")
      .bind(task.task_id),
    ...selected.skills.map((skill) =>
      env.DB.prepare(`
        INSERT INTO coding_task_skills (task_id, scope_kind, scope_id, skill_id, version)
        SELECT ?1, ?2, ?3, ?4, ?5
        WHERE EXISTS (
          SELECT 1 FROM coding_task_records
          WHERE task_id = ?1 AND assignment_generation = ?6
        )
      `).bind(
        task.task_id,
        skill.scopeKind,
        skill.scopeId,
        skill.skillId,
        skill.version,
        nextGeneration,
      ),
    ),
    ...quotaPolicies.map((policy) =>
      env.DB.prepare(`
        INSERT INTO coding_quota_reservations (
          task_id, scope_kind, scope_id, dimension_kind, subject_id
        )
        SELECT ?1, ?2, ?3, ?4, ?5
        WHERE EXISTS (
          SELECT 1 FROM coding_task_records
          WHERE task_id = ?1 AND assignment_generation = ?6
        )
          AND (
            SELECT COUNT(*) FROM coding_quota_reservations
            WHERE scope_kind = ?2 AND scope_id = ?3
              AND dimension_kind = ?4 AND subject_id = ?5
              AND released_at IS NULL
          ) < (
            SELECT max_active_tasks FROM coding_quota_policies
            WHERE scope_kind = ?2 AND scope_id = ?3
              AND dimension_kind = ?4 AND subject_id = ?5
          )
        ON CONFLICT (task_id, scope_kind, scope_id, dimension_kind) DO NOTHING
      `).bind(
        task.task_id,
        policy.scope_kind,
        policy.scope_id,
        policy.dimension_kind,
        policy.subject_id,
        nextGeneration,
      ),
    ),
    ...quotaPolicies.map((policy) =>
      env.DB.prepare(`
        UPDATE coding_task_records
        SET status = 'deferred', deferred_reason = 'quota_exceeded',
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE task_id = ?1 AND status = 'queued'
          AND NOT EXISTS (
            SELECT 1 FROM coding_quota_reservations
            WHERE task_id = ?1 AND scope_kind = ?2 AND scope_id = ?3
              AND dimension_kind = ?4 AND subject_id = ?5
              AND released_at IS NULL
          )
          AND (
            SELECT COUNT(*) FROM coding_quota_reservations
            WHERE scope_kind = ?2 AND scope_id = ?3
              AND dimension_kind = ?4 AND subject_id = ?5
              AND released_at IS NULL
          ) >= (
            SELECT max_active_tasks FROM coding_quota_policies
            WHERE scope_kind = ?2 AND scope_id = ?3
              AND dimension_kind = ?4 AND subject_id = ?5
          )
      `).bind(
        task.task_id,
        policy.scope_kind,
        policy.scope_id,
        policy.dimension_kind,
        policy.subject_id,
      ),
    ),
    env.DB.prepare(`
      INSERT OR IGNORE INTO coding_task_events (
        event_id, task_id, from_status, to_status, event_type,
        actor_id, reason, details_json
      )
      SELECT ?1, ?2, ?3, 'queued', 'task_reassigned',
        'boss_coding_worker', ?4, ?5
      WHERE EXISTS (
        SELECT 1 FROM coding_task_records
        WHERE task_id = ?2 AND assignment_generation = ?6
      )
    `).bind(
      `task:${task.task_id}:reassigned:${nextGeneration}`,
      task.task_id,
      task.status,
      excludeCurrentProfile ? "worker_overloaded" : "deferred_capacity_available",
      JSON.stringify({ profileId: selected.profile.profile_id }),
      nextGeneration,
    ),
    env.DB.prepare(`
      INSERT OR IGNORE INTO coding_task_events (
        event_id, task_id, from_status, to_status, event_type,
        actor_id, reason, details_json
      )
      SELECT ?1, ?2, 'queued', 'deferred', 'quota_deferred',
        'boss_coding_worker', 'quota_exceeded', '{}'
      WHERE EXISTS (
        SELECT 1 FROM coding_task_records
        WHERE task_id = ?2 AND assignment_generation = ?3 AND status = 'deferred'
      )
    `).bind(`task:${task.task_id}:deferred:${nextGeneration}`, task.task_id, nextGeneration),
  ];
  await env.DB.batch(statements);

  const updated = await env.DB.prepare(
    "SELECT status FROM coding_task_records WHERE task_id = ?1",
  ).bind(task.task_id).first<{ status: string }>();
  if (updated?.status !== "queued") return false;
  await env.CODING_TASKS_QUEUE.send(reassignedMessage);
  if (excludeCurrentProfile) {
    await sendAlert(
      env,
      "task_reassigned",
      `Stale task ${task.task_id} was assigned to profile ${selected.profile.profile_id}.`,
      task.hub_id,
    );
  }
  return true;
}

export async function handleCodingFleetMonitor(env: Env): Promise<void> {
  const policies = await loadHealthPolicies(env);
  const inspectedStaleTasks = new Set<string>();
  for (const policy of policies) {
    const backlog = await env.DB.prepare(`
      SELECT COUNT(*) AS task_count
      FROM coding_task_records
      WHERE specialization = ?1
        AND status IN ('accepted', 'queued', 'deferred', 'running')
        AND (?2 = 'platform' OR hub_id = ?3)
    `).bind(policy.specialization, policy.scope_kind, policy.scope_id)
      .first<{ task_count: number }>();
    if ((backlog?.task_count ?? 0) >= policy.max_backlog) {
      await sendAlert(
        env,
        "worker_backlog_threshold",
        `${policy.specialization} backlog reached ${backlog?.task_count ?? 0} tasks.`,
        policy.scope_kind === "hub" ? policy.scope_id : undefined,
      );
    }

    const health = await env.DB.prepare(`
      SELECT COUNT(*) AS attempt_count,
        SUM(CASE WHEN attempt.status = 'failed' THEN 1 ELSE 0 END) AS failure_count
      FROM coding_task_attempts AS attempt
      JOIN coding_task_records AS task ON task.task_id = attempt.task_id
      WHERE attempt.specialization = ?1
        AND attempt.status IN ('succeeded', 'failed')
        AND attempt.finished_at >= datetime('now', ?2)
        AND (?3 = 'platform' OR task.hub_id = ?4)
    `).bind(
      policy.specialization,
      `-${policy.window_seconds} seconds`,
      policy.scope_kind,
      policy.scope_id,
    ).first<{ attempt_count: number; failure_count: number | null }>();
    const attempts = health?.attempt_count ?? 0;
    const failures = health?.failure_count ?? 0;
    if (
      attempts >= policy.minimum_attempts
      && failures * 10000 / attempts > policy.max_failure_rate_basis_points
    ) {
      await sendAlert(
        env,
        "worker_failure_rate",
        `${policy.specialization} failure rate is ${Math.round(failures * 10000 / attempts)} basis points.`,
        policy.scope_kind === "hub" ? policy.scope_id : undefined,
      );
    }

    const stale = await env.DB.prepare(`
      SELECT record.task_id, record.hub_id, record.project_id, record.source_request_id,
        record.repository, record.base_branch, record.producer_id, record.requested_by,
        record.idempotency_key, record.specialization, record.priority,
        record.assignment_generation, record.reassign_count, record.status,
        record.profile_scope_kind, record.profile_scope_id, record.profile_id,
        record.profile_version, record.spec_paths_json, payload.payload_json
      FROM coding_task_records AS record
      JOIN coding_task_attempts AS attempt
        ON attempt.task_id = record.task_id
        AND attempt.assignment_generation = record.assignment_generation
      LEFT JOIN coding_task_payloads AS payload ON payload.task_id = record.task_id
      WHERE record.specialization = ?1
        AND record.status IN ('queued', 'running')
        AND attempt.status IN ('claimed', 'running')
        AND attempt.claimed_at <= datetime('now', ?2)
        AND (?3 = 'platform' OR record.hub_id = ?4)
      ORDER BY record.priority DESC, record.created_at
    `).bind(
      policy.specialization,
      `-${policy.stale_task_seconds} seconds`,
      policy.scope_kind,
      policy.scope_id,
    ).all<StoredTask>();
    if (!stale.success) {
      throw new CodingBossError("stale_task_lookup_failed", "Could not load stale coding tasks.");
    }
    for (const task of stale.results) {
      inspectedStaleTasks.add(task.task_id);
      await retryOrReassignTask(env, task, policy.max_reassignments, true);
    }
  }

  const deferred = await env.DB.prepare(`
    SELECT record.task_id, record.hub_id, record.project_id, record.source_request_id,
      record.repository, record.base_branch, record.producer_id, record.requested_by,
      record.idempotency_key, record.specialization, record.priority,
      record.assignment_generation, record.reassign_count, record.status,
      record.profile_scope_kind, record.profile_scope_id, record.profile_id,
      record.profile_version, record.spec_paths_json, payload.payload_json
    FROM coding_task_records AS record
    JOIN coding_task_payloads AS payload ON payload.task_id = record.task_id
    WHERE record.status = 'deferred'
    ORDER BY record.priority DESC, record.created_at
  `).all<StoredTask>();
  if (!deferred.success) {
    throw new CodingBossError("deferred_task_lookup_failed", "Could not load deferred coding tasks.");
  }
  for (const task of deferred.results) {
    if (inspectedStaleTasks.has(task.task_id)) continue;
    const policy = policyForTask(policies, task.hub_id, task.specialization);
    await retryOrReassignTask(env, task, policy?.max_reassignments ?? 3, false);
  }
}

export async function processCodingRequest(
  env: Env,
  message: CodingRequestMessage,
): Promise<"dispatched" | "deferred" | "already_processed"> {
  const existing = await findExistingTask(env, message);
  if (existing !== null) {
    if (existing.status === "accepted") {
      await enqueueAcceptedTask(env, existing);
      return "dispatched";
    }
    return "already_processed";
  }

  const specialization = specializationByKind[message.kind];
  const specPaths = await resolveOpenSpecArtifacts(
    message.repository,
    message.baseBranch,
    message.changeName,
    env.GITHUB_TOKEN,
  );
  const selected = await findCompatibleProfile(env, message.hubId, specialization, {
    requiredSpecPaths: specPaths,
  });
  const quotaPolicies = await loadQuotaPolicies(env, message.hubId, [
    {
      dimension: "agent",
      subjectId: [
        selected.profile.scope_kind,
        selected.profile.scope_id,
        selected.profile.profile_id,
      ].join(":"),
    },
    { dimension: "user", subjectId: message.actorId },
    { dimension: "project", subjectId: message.projectId },
  ]);
  const task = parseCodingTaskMessage({
    version: 1,
    taskId: crypto.randomUUID(),
    requestId: message.requestId,
    hubId: message.hubId,
    projectId: message.projectId,
    repository: message.repository,
    baseBranch: message.baseBranch,
    request: {
      kind: message.kind,
      title: message.title,
      description: message.description,
    },
    specialization,
    priority: message.priority,
    assignmentGeneration: 1,
    specPaths,
    profile: {
      scopeKind: selected.profile.scope_kind,
      scopeId: selected.profile.scope_id,
      profileId: selected.profile.profile_id,
      version: selected.profile.version,
    },
    skills: selected.skills,
  });
  const persisted = await persistTask(
    env,
    message,
    task,
    await requestDigest(message),
    quotaPolicies,
  );
  if (!persisted.created) {
    const racedTask = await findExistingTask(env, message);
    if (racedTask === null) {
      throw new CodingBossError(
        "task_persistence_failed",
        "The coding task was not persisted and no idempotent task record exists.",
      );
    }
    if (racedTask.status === "accepted") {
      await enqueueAcceptedTask(env, racedTask);
      return "dispatched";
    }
    return "already_processed";
  }

  if (persisted.deferredByQuota) {
    await sendAlert(
      env,
      "quota_exceeded",
      "The task was deferred because an active-task quota is full.",
      message.hubId,
    );
    return "deferred";
  }

  const storedTask = await findExistingTask(env, message);
  if (storedTask === null) {
    throw new CodingBossError(
      "task_persistence_failed",
      "The accepted coding task could not be reloaded from D1.",
    );
  }
  await enqueueAcceptedTask(env, storedTask);
  return "dispatched";
}

export async function handleCodingRequestBatch(
  batch: MessageBatch,
  env: Env,
): Promise<void> {
  const requests: Array<{
    message: Message;
    request: CodingRequestMessage;
  }> = [];
  for (const message of batch.messages) {
    try {
      requests.push({
        message,
        request: parseCodingRequestMessage(message.body),
      });
    } catch (error) {
      if (!(error instanceof InvalidCodingRequestError)) throw error;
      await sendAlert(env, "invalid_request", error.message);
      message.ack();
    }
  }

  requests.sort((left, right) => right.request.priority - left.request.priority);
  for (const { message, request } of requests) {
    try {
      await processCodingRequest(env, request);
      message.ack();
    } catch (error) {
      if (error instanceof OpenSpecResolutionError) {
        if (error.code === "source_unavailable") {
          message.retry({ delaySeconds: 30 });
          continue;
        }
        await sendAlert(env, error.code, error.message, request.hubId);
        message.ack();
        continue;
      }
      if (error instanceof CodingBossError) {
        await sendAlert(env, error.code, error.message, request.hubId);
        message.ack();
        continue;
      }
      throw error;
    }
  }
}
