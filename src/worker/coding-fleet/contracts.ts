export type CodingRequestSource = "ui" | "github" | "system";

export type CodingRequestKind =
  | "feature"
  | "refactor"
  | "test"
  | "documentation"
  | "bug";

export interface CodingProducerPrincipal {
  source: CodingRequestSource;
  producerId: string;
  actorId: string;
  hubId: string;
  projectId: string;
}

export interface CodingRequestInput {
  requestId: string;
  repository: string;
  baseBranch: string;
  changeName: string;
  kind: CodingRequestKind;
  title: string;
  description: string;
  priority?: number;
}

export interface CodingRequestMessage extends CodingProducerPrincipal {
  version: 1;
  requestId: string;
  idempotencyKey: string;
  repository: string;
  baseBranch: string;
  changeName: string;
  kind: CodingRequestKind;
  title: string;
  description: string;
  priority: number;
  requestedAt: string;
}

export interface CodingTaskMessage {
  version: 1;
  taskId: string;
  requestId: string;
  hubId: string;
  projectId: string;
  repository: string;
  baseBranch: string;
  request: {
    kind: CodingRequestKind;
    title: string;
    description: string;
  };
  specialization: "feature_impl" | "refactor" | "test_writer" | "doc_writer" | "bug_fix";
  priority: number;
  assignmentGeneration: number;
  specPaths: string[];
  profile: {
    scopeKind: "platform" | "hub";
    scopeId: string;
    profileId: string;
    version: number;
  };
  skills: Array<{
    scopeKind: "platform" | "hub";
    scopeId: string;
    skillId: string;
    version: number;
  }>;
}

export interface CodingResultMessage {
  version: 1;
  taskId: string;
  status: "succeeded" | "failed" | "blocked";
  explanation: string;
  validation: {
    status: "passed" | "failed" | "not_run";
    output?: string;
  };
  diff?: {
    reference: string;
    digest: string;
  };
  agentProfile: {
    profileId: string;
    version: number;
  };
  skills: Array<{
    skillId: string;
    version: number;
  }>;
  models: string[];
  failureCode?: string;
  completedAt: string;
}

export interface CodingAlertMessage {
  version: 1;
  alertId: string;
  taskId?: string;
  hubId?: string;
  severity: "low" | "medium" | "high" | "critical";
  code: string;
  message: string;
  occurredAt: string;
}

export class InvalidCodingRequestError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid coding request: ${issues.join(", ")}`);
    this.name = "InvalidCodingRequestError";
  }
}

const requestKinds: ReadonlySet<string> = new Set([
  "feature",
  "refactor",
  "test",
  "documentation",
  "bug",
]);
const requestSources: ReadonlySet<string> = new Set(["ui", "github", "system"]);
const specializations: ReadonlySet<string> = new Set([
  "feature_impl",
  "refactor",
  "test_writer",
  "doc_writer",
  "bug_fix",
]);
const validationStatuses: ReadonlySet<string> = new Set(["passed", "failed", "not_run"]);
const profileScopes: ReadonlySet<string> = new Set(["platform", "hub"]);
const resultStatusSet: ReadonlySet<string> = new Set(["succeeded", "failed", "blocked"]);
const alertSeveritySet: ReadonlySet<string> = new Set(["low", "medium", "high", "critical"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isSpecialization(
  value: unknown,
): value is CodingTaskMessage["specialization"] {
  return typeof value === "string" && specializations.has(value);
}

function isProfileScope(value: unknown): value is "platform" | "hub" {
  return typeof value === "string" && profileScopes.has(value);
}

function isCodingTaskProfile(
  value: unknown,
): value is CodingTaskMessage["profile"] {
  return isRecord(value)
    && isProfileScope(value.scopeKind)
    && isString(value.scopeId)
    && isString(value.profileId)
    && isPositiveInteger(value.version);
}

function isCodingTaskSkill(
  value: unknown,
): value is CodingTaskMessage["skills"][number] {
  return isRecord(value)
    && isProfileScope(value.scopeKind)
    && isString(value.scopeId)
    && isString(value.skillId)
    && isPositiveInteger(value.version);
}

function isCodingResultValidation(
  value: unknown,
): value is CodingResultMessage["validation"] {
  return isRecord(value)
    && typeof value.status === "string"
    && validationStatuses.has(value.status)
    && (value.output === undefined || typeof value.output === "string");
}

function isCodingResultStatus(
  value: unknown,
): value is CodingResultMessage["status"] {
  return typeof value === "string" && resultStatusSet.has(value);
}

function isCodingAlertSeverity(
  value: unknown,
): value is CodingAlertMessage["severity"] {
  return typeof value === "string" && alertSeveritySet.has(value);
}

function isCodingResultProfile(
  value: unknown,
): value is CodingResultMessage["agentProfile"] {
  return isRecord(value)
    && isString(value.profileId)
    && isPositiveInteger(value.version);
}

function isCodingResultSkill(
  value: unknown,
): value is CodingResultMessage["skills"][number] {
  return isRecord(value)
    && isString(value.skillId)
    && isPositiveInteger(value.version);
}

function isCodingResultDiff(
  value: unknown,
): value is NonNullable<CodingResultMessage["diff"]> {
  return isRecord(value) && isString(value.reference) && isString(value.digest);
}

function requiredString(
  value: unknown,
  name: string,
  maxLength: number,
  issues: string[],
): string | undefined {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.trim().length > maxLength
  ) {
    issues.push(name);
    return undefined;
  }
  return value.trim();
}

export function isCodingRequestSource(value: unknown): value is CodingRequestSource {
  return typeof value === "string" && requestSources.has(value);
}

export function isCodingRequestKind(value: unknown): value is CodingRequestKind {
  return typeof value === "string" && requestKinds.has(value);
}

export function parseCodingRequestMessage(value: unknown): CodingRequestMessage {
  if (!isRecord(value)) throw new InvalidCodingRequestError(["request"]);
  const requestedAt = value.requestedAt;
  if (typeof requestedAt !== "string") {
    throw new InvalidCodingRequestError(["requestedAt"]);
  }

  const message = createCodingRequestMessage(
    {
      source: value.source,
      producerId: value.producerId,
      actorId: value.actorId,
      hubId: value.hubId,
      projectId: value.projectId,
    },
    {
      requestId: value.requestId,
      repository: value.repository,
      baseBranch: value.baseBranch,
      changeName: value.changeName,
      kind: value.kind,
      title: value.title,
      description: value.description,
      priority: value.priority,
    },
    requestedAt,
  );
  if (value.version !== 1 || value.idempotencyKey !== message.idempotencyKey) {
    throw new InvalidCodingRequestError(["version or idempotencyKey"]);
  }
  return message;
}

export function createCodingRequestMessage(
  principal: unknown,
  input: unknown,
  requestedAt = new Date().toISOString(),
): CodingRequestMessage {
  const issues: string[] = [];
  const normalizedPrincipal: Record<string, unknown> = isRecord(principal)
    ? principal
    : {};
  const source = normalizedPrincipal.source;
  if (!isCodingRequestSource(source)) {
    issues.push("source");
  }

  const producerId = requiredString(normalizedPrincipal.producerId, "producerId", 200, issues);
  const actorId = requiredString(normalizedPrincipal.actorId, "actorId", 200, issues);
  const hubId = requiredString(normalizedPrincipal.hubId, "hubId", 200, issues);
  const projectId = requiredString(normalizedPrincipal.projectId, "projectId", 200, issues);

  if (!isRecord(input)) {
    throw new InvalidCodingRequestError(["request"]);
  }

  const requestId = requiredString(input.requestId, "requestId", 200, issues);
  const repository = requiredString(input.repository, "repository", 400, issues);
  const baseBranch = requiredString(input.baseBranch, "baseBranch", 255, issues);
  const changeName = requiredString(input.changeName, "changeName", 200, issues);
  const title = requiredString(input.title, "title", 200, issues);
  const description = requiredString(input.description, "description", 20000, issues);
  const kind = input.kind;
  const priority = input.priority === undefined ? 50 : input.priority;

  if (!isCodingRequestKind(kind)) {
    issues.push("kind");
  }
  if (
    typeof repository === "string"
    && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
  ) {
    issues.push("repository");
  }
  if (
    typeof changeName === "string"
    && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(changeName)
  ) {
    issues.push("changeName");
  }
  if (
    typeof priority !== "number"
    || !Number.isInteger(priority)
    || priority < 0
    || priority > 100
  ) {
    issues.push("priority");
  }
  if (!isValidTimestamp(requestedAt)) {
    issues.push("requestedAt");
  }

  if (
    issues.length > 0
    || !isCodingRequestSource(source)
    || !producerId
    || !actorId
    || !hubId
    || !projectId
    || !requestId
    || !repository
    || !baseBranch
    || !changeName
    || !title
    || !description
    || !isCodingRequestKind(kind)
    || typeof priority !== "number"
    || !isValidTimestamp(requestedAt)
  ) {
    throw new InvalidCodingRequestError(issues);
  }

  const identity: CodingProducerPrincipal = {
    source,
    producerId,
    actorId,
    hubId,
    projectId,
  };

  return {
    version: 1,
    ...identity,
    requestId,
    idempotencyKey: `${identity.producerId}:${requestId}`,
    repository,
    baseBranch,
    changeName,
    kind,
    title,
    description,
    priority,
    requestedAt,
  };
}

export function parseCodingTaskMessage(value: unknown): CodingTaskMessage {
  const issues: string[] = [];
  if (!isRecord(value)) throw new InvalidCodingRequestError(["task"]);
  const profile = value.profile;
  const skills = value.skills;
  const specialization = value.specialization;
  const paths = value.specPaths;
  const request = value.request;
  if (value.version !== 1) issues.push("version");
  for (const key of ["taskId", "requestId", "hubId", "projectId", "repository", "baseBranch"]) {
    if (!isString(value[key])) issues.push(key);
  }
  if (typeof specialization !== "string" || !specializations.has(specialization)) {
    issues.push("specialization");
  }
  if (
    typeof value.priority !== "number"
    || !Number.isInteger(value.priority)
    || value.priority < 0
    || value.priority > 100
  ) {
    issues.push("priority");
  }
  if (!isPositiveInteger(value.assignmentGeneration)) issues.push("assignmentGeneration");
  if (!isStringArray(paths)) issues.push("specPaths");
  if (
    !isRecord(request)
    || !isCodingRequestKind(request.kind)
    || !isString(request.title)
    || request.title.length > 200
    || !isString(request.description)
    || request.description.length > 20000
  ) {
    issues.push("request");
  }
  if (
    !isRecord(profile)
    || typeof profile.scopeKind !== "string"
    || !profileScopes.has(profile.scopeKind)
    || !isString(profile.scopeId)
    || !isString(profile.profileId)
    || !isPositiveInteger(profile.version)
  ) {
    issues.push("profile");
  }
  if (
    !Array.isArray(skills)
    || !skills.every((skill) =>
      isRecord(skill)
      && typeof skill.scopeKind === "string"
      && profileScopes.has(skill.scopeKind)
      && isString(skill.scopeId)
      && isString(skill.skillId)
      && isPositiveInteger(skill.version)
    )
  ) {
    issues.push("skills");
  }
  if (issues.length > 0) throw new InvalidCodingRequestError(issues);
  if (
    value.version !== 1
    || !isString(value.taskId)
    || !isString(value.requestId)
    || !isString(value.hubId)
    || !isString(value.projectId)
    || !isString(value.repository)
    || !isString(value.baseBranch)
    || !isSpecialization(specialization)
    || typeof value.priority !== "number"
    || !Number.isInteger(value.priority)
    || value.priority < 0
    || value.priority > 100
    || !isPositiveInteger(value.assignmentGeneration)
    || !isStringArray(paths)
    || !isRecord(request)
    || !isCodingRequestKind(request.kind)
    || !isString(request.title)
    || request.title.length > 200
    || !isString(request.description)
    || request.description.length > 20000
    || !isCodingTaskProfile(profile)
    || !Array.isArray(skills)
    || !skills.every(isCodingTaskSkill)
  ) {
    throw new InvalidCodingRequestError(["task"]);
  }
  return {
    version: 1,
    taskId: value.taskId,
    requestId: value.requestId,
    hubId: value.hubId,
    projectId: value.projectId,
    repository: value.repository,
    baseBranch: value.baseBranch,
    request: {
      kind: request.kind,
      title: request.title,
      description: request.description,
    },
    specialization,
    priority: value.priority,
    assignmentGeneration: value.assignmentGeneration,
    specPaths: paths,
    profile,
    skills,
  };
}

export function parseCodingResultMessage(value: unknown): CodingResultMessage {
  const issues: string[] = [];
  if (!isRecord(value)) throw new InvalidCodingRequestError(["result"]);
  const validation = value.validation;
  const profile = value.agentProfile;
  const skills = value.skills;
  const diff = value.diff;
  const status = value.status;
  if (value.version !== 1) issues.push("version");
  if (!isString(value.taskId) || !isString(value.explanation)) issues.push("task identity or explanation");
  if (!isCodingResultStatus(status)) issues.push("status");
  if (!isValidTimestamp(value.completedAt)) issues.push("completedAt");
  if (
    !isRecord(validation)
    || typeof validation.status !== "string"
    || !validationStatuses.has(validation.status)
    || (validation.output !== undefined && typeof validation.output !== "string")
  ) {
    issues.push("validation");
  }
  if (
    !isRecord(profile)
    || !isString(profile.profileId)
    || !isPositiveInteger(profile.version)
  ) {
    issues.push("agentProfile");
  }
  if (
    !Array.isArray(skills)
    || !skills.every((skill) =>
      isRecord(skill) && isString(skill.skillId) && isPositiveInteger(skill.version)
    )
  ) {
    issues.push("skills");
  }
  if (!isStringArray(value.models)) issues.push("models");
  if (
    diff !== undefined
    && (
      !isRecord(diff)
      || !isString(diff.reference)
      || !isString(diff.digest)
    )
  ) {
    issues.push("diff");
  }
  if (
    status === "succeeded"
    && (
      !isRecord(validation)
      || validation.status !== "passed"
      || !isRecord(diff)
    )
  ) {
    issues.push("successful result requires passing validation and a diff");
  }
  if (
    (status === "failed" || status === "blocked")
    && !isString(value.failureCode)
  ) {
    issues.push("failureCode");
  }
  if (value.failureCode !== undefined && !isString(value.failureCode)) {
    issues.push("failureCode");
  }
  if (issues.length > 0) throw new InvalidCodingRequestError(issues);
  if (
    value.version !== 1
    || !isString(value.taskId)
    || !isString(value.explanation)
    || !isCodingResultStatus(status)
    || !isValidTimestamp(value.completedAt)
    || !isCodingResultValidation(validation)
    || !isCodingResultProfile(profile)
    || !Array.isArray(skills)
    || !skills.every(isCodingResultSkill)
    || !isStringArray(value.models)
    || (diff !== undefined && !isCodingResultDiff(diff))
    || (value.failureCode !== undefined && !isString(value.failureCode))
    || (status === "succeeded" && (
      validation.status !== "passed" || !isCodingResultDiff(diff)
    ))
    || ((status === "failed" || status === "blocked") && !isString(value.failureCode))
  ) {
    throw new InvalidCodingRequestError(["result"]);
  }
  return {
    version: 1,
    taskId: value.taskId,
    status,
    explanation: value.explanation,
    validation,
    ...(diff === undefined ? {} : { diff }),
    agentProfile: profile,
    skills,
    models: value.models,
    ...(value.failureCode === undefined ? {} : { failureCode: value.failureCode }),
    completedAt: value.completedAt,
  };
}

export function parseCodingAlertMessage(value: unknown): CodingAlertMessage {
  const issues: string[] = [];
  if (!isRecord(value)) throw new InvalidCodingRequestError(["alert"]);
  if (value.version !== 1) issues.push("version");
  for (const key of ["alertId", "code", "message"]) {
    if (!isString(value[key])) issues.push(key);
  }
  if (!isCodingAlertSeverity(value.severity)) {
    issues.push("severity");
  }
  if (value.taskId !== undefined && !isString(value.taskId)) issues.push("taskId");
  if (value.hubId !== undefined && !isString(value.hubId)) issues.push("hubId");
  if (!isValidTimestamp(value.occurredAt)) issues.push("occurredAt");
  if (issues.length > 0) throw new InvalidCodingRequestError(issues);
  if (
    value.version !== 1
    || !isString(value.alertId)
    || !isCodingAlertSeverity(value.severity)
    || !isString(value.code)
    || !isString(value.message)
    || (value.taskId !== undefined && !isString(value.taskId))
    || (value.hubId !== undefined && !isString(value.hubId))
    || !isValidTimestamp(value.occurredAt)
  ) {
    throw new InvalidCodingRequestError(["alert"]);
  }
  return {
    version: 1,
    alertId: value.alertId,
    ...(value.taskId === undefined ? {} : { taskId: value.taskId }),
    ...(value.hubId === undefined ? {} : { hubId: value.hubId }),
    severity: value.severity,
    code: value.code,
    message: value.message,
    occurredAt: value.occurredAt,
  };
}
