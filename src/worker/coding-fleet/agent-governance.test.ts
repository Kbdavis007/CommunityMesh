import { describe, expect, it } from "vitest";
import {
  AgentProfileConfigurationError,
  assertHubProfileWithinBaseline,
  isAgentPathAllowed,
  parseAgentProfileConfiguration,
} from "./agent-governance";

const baselineJson = {
  taskTypes: ["feature_impl"],
  requiredSkills: [{ scopeKind: "platform", scopeId: "platform", skillId: "spec-reader", version: 1 }],
  allowedRepositoryPaths: ["src/**"],
  allowedSpecPaths: ["openspec/**"],
  allowedOperations: ["read", "write", "run_tests", "openspec_validate"],
  resourceLimits: {
    maxTokens: 20000,
    maxFiles: 30,
    maxDurationSeconds: 3600,
    maxDiffBytes: 1000000,
  },
};

function hubProfile(overrides: Record<string, unknown> = {}) {
  return {
    baselineProfile: { profileId: "agent-baseline", version: 1 },
    taskTypes: ["feature_impl"],
    requiredSkills: [
      { scopeKind: "platform", scopeId: "platform", skillId: "spec-reader", version: 1 },
    ],
    allowedRepositoryPaths: ["src/features/**"],
    allowedSpecPaths: ["openspec/changes/**"],
    allowedOperations: ["read", "write", "run_tests"],
    resourceLimits: {
      maxTokens: 10000,
      maxFiles: 10,
      maxDurationSeconds: 1800,
      maxDiffBytes: 250000,
    },
    ...overrides,
  };
}

describe("agent profile guardrails", () => {
  it("accepts hub profiles narrowed from an exact platform baseline", () => {
    const baseline = parseAgentProfileConfiguration(baselineJson, "hub-1", "platform");
    const profile = parseAgentProfileConfiguration(hubProfile(), "hub-1", "hub");

    expect(() => assertHubProfileWithinBaseline(profile, baseline)).not.toThrow();
  });

  it.each([
    [
      "task types",
      { taskTypes: ["feature_impl", "refactor"] },
    ],
    [
      "repository paths",
      { allowedRepositoryPaths: ["src/**", "secrets/**"] },
    ],
    [
      "operations",
      { allowedOperations: ["read", "write", "schema_change"] },
    ],
    [
      "resource limits",
      {
        resourceLimits: {
          maxTokens: 20001,
          maxFiles: 10,
          maxDurationSeconds: 1800,
          maxDiffBytes: 250000,
        },
      },
    ],
    ["required skills", { requiredSkills: [] }],
  ])("rejects a hub profile that widens baseline %s", (_label, override) => {
    const baseline = parseAgentProfileConfiguration(baselineJson, "hub-1", "platform");
    const profile = parseAgentProfileConfiguration(
      hubProfile(override),
      "hub-1",
      "hub",
    );

    expect(() => assertHubProfileWithinBaseline(profile, baseline)).toThrow(
      AgentProfileConfigurationError,
    );
  });

  it("rejects cross-hub skills and path traversal patterns", () => {
    expect(() => parseAgentProfileConfiguration(
      hubProfile({
        requiredSkills: [{
          scopeKind: "hub",
          scopeId: "hub-2",
          skillId: "private-skill",
          version: 1,
        }],
      }),
      "hub-1",
      "hub",
    )).toThrow(/cross-hub/);
    expect(() => parseAgentProfileConfiguration(
      hubProfile({ allowedRepositoryPaths: ["../secrets/**"] }),
      "hub-1",
      "hub",
    )).toThrow(/invalid or non-relative/);
  });

  it("matches only permitted repository-relative paths", () => {
    expect(isAgentPathAllowed("src/features/panel.ts", ["src/features/**"])).toBe(true);
    expect(isAgentPathAllowed("src/admin/panel.ts", ["src/features/**"])).toBe(false);
    expect(isAgentPathAllowed("../secrets.txt", ["**"])).toBe(false);
    expect(isAgentPathAllowed("/etc/passwd", ["**"])).toBe(false);
  });
});
