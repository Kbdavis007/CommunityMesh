import type { CodingTaskMessage } from "./contracts";

export type AgentOperation =
  | "read"
  | "write"
  | "run_tests"
  | "openspec_validate"
  | "create_branch"
  | "schema_change";

export interface AgentResourceLimits {
  maxTokens: number;
  maxFiles: number;
  maxDurationSeconds: number;
  maxDiffBytes: number;
}

export interface AgentProfileConfiguration {
  baselineProfile?: {
    profileId: string;
    version: number;
  };
  taskTypes: CodingTaskMessage["specialization"][];
  requiredSkills: Array<{
    scopeKind: "platform" | "hub";
    scopeId: string;
    skillId: string;
    version: number;
  }>;
  allowedRepositoryPaths: string[];
  allowedSpecPaths: string[];
  allowedOperations: AgentOperation[];
  resourceLimits: AgentResourceLimits;
}

export class AgentProfileConfigurationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AgentProfileConfigurationError";
  }
}

const specializations: ReadonlySet<string> = new Set([
  "feature_impl",
  "refactor",
  "test_writer",
  "doc_writer",
  "bug_fix",
]);
const operations: ReadonlySet<string> = new Set([
  "read",
  "write",
  "run_tests",
  "openspec_validate",
  "create_branch",
  "schema_change",
]);

function isSpecialization(
  value: unknown,
): value is CodingTaskMessage["specialization"] {
  return typeof value === "string" && specializations.has(value);
}

function isAgentOperation(value: unknown): value is AgentOperation {
  return typeof value === "string" && operations.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parsePathPatterns(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || !value.every((path) => typeof path === "string")
  ) {
    throw new AgentProfileConfigurationError(
      "invalid_profile",
      `${label} must be a non-empty array of relative path patterns.`,
    );
  }

  for (const path of value) {
    const segments = path.split("/");
    if (
      path.trim() !== path
      || path.length === 0
      || path.startsWith("/")
      || path.includes("\\")
      || segments.some((segment) =>
        segment.length === 0
        || segment === "."
        || segment === ".."
        || (segment === "**" && segments.at(-1) !== "**")
        || (segment !== "**" && !/^[A-Za-z0-9_.-]+$/.test(segment))
      )
    ) {
      throw new AgentProfileConfigurationError(
        "invalid_profile",
        `${label} contains an invalid or non-relative path pattern.`,
      );
    }
  }
  return value;
}

export function parseAgentProfileConfiguration(
  value: unknown,
  hubId: string,
  scopeKind: "platform" | "hub",
): AgentProfileConfiguration {
  if (!isRecord(value)) {
    throw new AgentProfileConfigurationError("invalid_profile", "Agent profile must be a JSON object.");
  }

  const baselineProfile = value.baselineProfile;
  let parsedBaseline: AgentProfileConfiguration["baselineProfile"];
  if (scopeKind === "hub") {
    if (
      !isRecord(baselineProfile)
      || typeof baselineProfile.profileId !== "string"
      || baselineProfile.profileId.trim().length === 0
      || !isPositiveInteger(baselineProfile.version)
    ) {
      throw new AgentProfileConfigurationError(
        "invalid_profile",
        "A hub profile must reference an exact platform baseline profile version.",
      );
    }
    parsedBaseline = {
      profileId: baselineProfile.profileId,
      version: baselineProfile.version,
    };
  } else if (baselineProfile !== undefined) {
    throw new AgentProfileConfigurationError(
      "invalid_profile",
      "Platform profiles cannot inherit from another profile.",
    );
  }

  if (
    !Array.isArray(value.taskTypes)
    || value.taskTypes.length === 0
    ||     !value.taskTypes.every(isSpecialization)
    || !Array.isArray(value.requiredSkills)
  ) {
    throw new AgentProfileConfigurationError(
      "invalid_profile",
      "Agent profile requires supported taskTypes and a requiredSkills array.",
    );
  }

  const requiredSkills: AgentProfileConfiguration["requiredSkills"] = [];
  for (const skill of value.requiredSkills) {
    if (
      !isRecord(skill)
      || (skill.scopeKind !== "platform" && skill.scopeKind !== "hub")
      || typeof skill.scopeId !== "string"
      || skill.scopeId.trim().length === 0
      || typeof skill.skillId !== "string"
      || skill.skillId.trim().length === 0
      || !isPositiveInteger(skill.version)
      || (skill.scopeKind === "platform" && skill.scopeId !== "platform")
      || (skill.scopeKind === "hub" && skill.scopeId !== hubId)
    ) {
      throw new AgentProfileConfigurationError(
        "invalid_profile",
        "Agent profile contains an invalid or cross-hub skill reference.",
      );
    }
    requiredSkills.push({
      scopeKind: skill.scopeKind,
      scopeId: skill.scopeId,
      skillId: skill.skillId,
      version: skill.version,
    });
  }

  const allowedRepositoryPaths = parsePathPatterns(
    value.allowedRepositoryPaths,
    "allowedRepositoryPaths",
  );
  const allowedSpecPaths = parsePathPatterns(value.allowedSpecPaths, "allowedSpecPaths");
  if (
    !Array.isArray(value.allowedOperations)
    || value.allowedOperations.length === 0
    || !value.allowedOperations.every(isAgentOperation)
  ) {
    throw new AgentProfileConfigurationError(
      "invalid_profile",
      "allowedOperations must contain at least one supported operation.",
    );
  }
  if (!isRecord(value.resourceLimits)) {
    throw new AgentProfileConfigurationError(
      "invalid_profile",
      "resourceLimits must define positive integer bounds.",
    );
  }
  const { maxTokens, maxFiles, maxDurationSeconds, maxDiffBytes } = value.resourceLimits;
  if (
    !isPositiveInteger(maxTokens)
    || !isPositiveInteger(maxFiles)
    || !isPositiveInteger(maxDurationSeconds)
    || !isPositiveInteger(maxDiffBytes)
  ) {
    throw new AgentProfileConfigurationError(
      "invalid_profile",
      "resourceLimits must define positive integer bounds.",
    );
  }
  const resourceLimits: AgentResourceLimits = {
    maxTokens,
    maxFiles,
    maxDurationSeconds,
    maxDiffBytes,
  };

  return {
    ...(parsedBaseline === undefined ? {} : { baselineProfile: parsedBaseline }),
    taskTypes: value.taskTypes,
    requiredSkills,
    allowedRepositoryPaths,
    allowedSpecPaths,
    allowedOperations: value.allowedOperations,
    resourceLimits,
  };
}

function isPathPatternWithin(
  child: string,
  parent: string,
): boolean {
  if (child === parent || parent === "**") return true;
  if (!parent.endsWith("/**")) return false;
  const directory = parent.slice(0, -3);
  return child === directory || child.startsWith(`${directory}/`);
}

function arePathsNarrowed(children: string[], parents: string[]): boolean {
  return children.every((child) =>
    parents.some((parent) => isPathPatternWithin(child, parent))
  );
}

export function isAgentPathAllowed(path: string, patterns: string[]): boolean {
  if (
    path.length === 0
    || path.trim() !== path
    || path.startsWith("/")
    || path.includes("\\")
    || path.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    return false;
  }
  return patterns.some((pattern) => isPathPatternWithin(path, pattern));
}

export function assertHubProfileWithinBaseline(
  hubProfile: AgentProfileConfiguration,
  baseline: AgentProfileConfiguration,
): void {
  const baselineSkillKeys = new Set(baseline.requiredSkills.map((skill) =>
    `${skill.scopeKind}:${skill.scopeId}:${skill.skillId}@${skill.version}`
  ));
  if (
    !hubProfile.taskTypes.every((taskType) => baseline.taskTypes.includes(taskType))
    || !arePathsNarrowed(
      hubProfile.allowedRepositoryPaths,
      baseline.allowedRepositoryPaths,
    )
    || !arePathsNarrowed(hubProfile.allowedSpecPaths, baseline.allowedSpecPaths)
    || !hubProfile.allowedOperations.every((operation) =>
      baseline.allowedOperations.includes(operation)
    )
    || hubProfile.resourceLimits.maxTokens > baseline.resourceLimits.maxTokens
    || hubProfile.resourceLimits.maxFiles > baseline.resourceLimits.maxFiles
    || hubProfile.resourceLimits.maxDurationSeconds > baseline.resourceLimits.maxDurationSeconds
    || hubProfile.resourceLimits.maxDiffBytes > baseline.resourceLimits.maxDiffBytes
    || !baselineSkillKeysIsSubset(baselineSkillKeys, hubProfile.requiredSkills)
  ) {
    throw new AgentProfileConfigurationError(
      "profile_exceeds_baseline",
      "The hub profile widens platform task, path, operation, skill, or resource guardrails.",
    );
  }
}

function baselineSkillKeysIsSubset(
  baselineSkills: Set<string>,
  hubSkills: AgentProfileConfiguration["requiredSkills"],
): boolean {
  const hubSkillKeys = new Set(hubSkills.map((skill) =>
    `${skill.scopeKind}:${skill.scopeId}:${skill.skillId}@${skill.version}`
  ));
  return [...baselineSkills].every((skill) => hubSkillKeys.has(skill));
}
