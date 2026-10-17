import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../index";
import {
  createCodingRequestMessage,
  InvalidCodingRequestError,
  parseCodingAlertMessage,
  parseCodingResultMessage,
  parseCodingTaskMessage,
  type CodingProducerPrincipal,
  type CodingRequestInput,
} from "./contracts";
import {
  enqueueGitHubCodingRequest,
  enqueueSystemCodingRequest,
  enqueueUiCodingRequest,
} from "./queue-producers";

const input: CodingRequestInput = {
  requestId: "request-1",
  repository: "communitymesh/app",
  baseBranch: "main",
  changeName: "add-feature",
  kind: "feature",
  title: "Add a feature",
  description: "Implement the behavior described by the OpenSpec change.",
};

function principal(source: CodingProducerPrincipal["source"]): CodingProducerPrincipal {
  return {
    source,
    producerId: `${source}-producer`,
    actorId: `${source}-actor`,
    hubId: "hub-1",
    projectId: "project-1",
  };
}

describe("coding request queue contracts", () => {
  it("uses trusted producer context for attribution and idempotency", () => {
    const message = createCodingRequestMessage(
      principal("ui"),
      {
        ...input,
        hubId: "spoofed-hub",
        projectId: "spoofed-project",
        source: "system",
        actorId: "spoofed-actor",
      },
      "2026-10-17T00:00:00.000Z",
    );

    expect(message).toMatchObject({
      version: 1,
      source: "ui",
      producerId: "ui-producer",
      actorId: "ui-actor",
      hubId: "hub-1",
      projectId: "project-1",
      requestId: "request-1",
      idempotencyKey: "ui-producer:request-1",
      priority: 50,
      requestedAt: "2026-10-17T00:00:00.000Z",
    });
  });

  it("provides queue adapters for UI, GitHub, and system producers", async () => {
    const send = vi.fn(async () => undefined);
    const queue = { send };
    const producers = [
      enqueueUiCodingRequest(queue, { ...principal("ui"), source: "ui" }, input),
      enqueueGitHubCodingRequest(queue, { ...principal("github"), source: "github" }, input),
      enqueueSystemCodingRequest(queue, { ...principal("system"), source: "system" }, input),
    ];

    const messages = await Promise.all(producers);

    expect(send).toHaveBeenCalledTimes(3);
    expect(messages.map(({ source }) => source)).toEqual(["ui", "github", "system"]);
    expect(messages.every(({ hubId }) => hubId === "hub-1")).toBe(true);
  });

  it("rejects malformed request envelopes before queue publication", async () => {
    const send = vi.fn(async () => undefined);
    const queue = { send };

    await expect(
      enqueueUiCodingRequest(queue, { ...principal("ui"), source: "ui" }, {
        ...input,
        repository: "../other/repo",
        changeName: "not a change",
        priority: 101,
      }),
    ).rejects.toBeInstanceOf(InvalidCodingRequestError);
    expect(send).not.toHaveBeenCalled();
  });

  it("validates normalized task, result, and alert envelopes", () => {
    expect(parseCodingTaskMessage({
      version: 1,
      taskId: "task-1",
      requestId: "request-1",
      hubId: "hub-1",
      projectId: "project-1",
      repository: "communitymesh/app",
      baseBranch: "main",
      request: {
        kind: "feature",
        title: "Add a feature",
        description: "Implement the request.",
      },
      specialization: "feature_impl",
      priority: 50,
      assignmentGeneration: 1,
      specPaths: ["openspec/changes/add-feature/specs/feature/spec.md"],
      profile: {
        scopeKind: "platform",
        scopeId: "platform",
        profileId: "agent-feature",
        version: 1,
      },
      skills: [],
    }).taskId).toBe("task-1");

    expect(parseCodingResultMessage({
      version: 1,
      taskId: "task-1",
      status: "succeeded",
      explanation: "Implemented the task.",
      validation: { status: "passed" },
      diff: { reference: "artifact://task-1", digest: "sha256:digest" },
      agentProfile: { profileId: "agent-feature", version: 1 },
      skills: [],
      models: ["model-x"],
      completedAt: "2026-10-17T00:00:00.000Z",
    }).status).toBe("succeeded");

    expect(parseCodingAlertMessage({
      version: 1,
      alertId: "alert-1",
      taskId: "task-1",
      hubId: "hub-1",
      severity: "high",
      code: "quota_exceeded",
      message: "Task exceeds the configured quota.",
      occurredAt: "2026-10-17T00:00:00.000Z",
    }).code).toBe("quota_exceeded");

    expect(() => parseCodingResultMessage({
      version: 1,
      taskId: "task-1",
      status: "succeeded",
      explanation: "Incorrectly marked successful.",
      validation: { status: "failed" },
      agentProfile: { profileId: "agent-feature", version: 1 },
      skills: [],
      models: [],
      completedAt: "2026-10-17T00:00:00.000Z",
    })).toThrow(InvalidCodingRequestError);
  });

  it("does not execute coding tasks from direct Worker HTTP requests", async () => {
    const response = await handleRequest(
      new Request("https://api.communitymesh.test/api/v1/coding-requests", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
