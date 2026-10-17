import { describe, expect, it, vi } from "vitest";
import {
  OpenSpecResolutionError,
  resolveOpenSpecArtifacts,
} from "./spec-resolver";

const proposal = `# Proposal

## Capabilities

### New Capabilities
- \`coding-worker\`: Queue-driven worker behavior.

### Modified Capabilities

None.

## Impact

Cloudflare Worker.
`;

function githubResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function successFetcher(specExists = true, token?: string) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/git/trees/main")) {
      const paths = [
        "openspec/changes/add-worker/proposal.md",
        "openspec/changes/add-worker/design.md",
        "openspec/changes/add-worker/tasks.md",
        ...(specExists
          ? ["openspec/changes/add-worker/specs/coding-worker/spec.md"]
          : []),
      ];
      return githubResponse({
        tree: paths.map((path) => ({ path, type: "blob" })),
      });
    }
    expect(new Headers(init?.headers).get("authorization"))
      .toBe(token === undefined ? null : `Bearer ${token}`);
    return githubResponse({
      type: "file",
      encoding: "base64",
      content: btoa(proposal),
    });
  });
}

describe("OpenSpec artifact resolution", () => {
  it("resolves declared capabilities and the required change artifacts", async () => {
    const fetcher = successFetcher(true, "github-token");
    const paths = await resolveOpenSpecArtifacts(
      "communitymesh/app",
      "main",
      "add-worker",
      "github-token",
      fetcher,
    );

    expect(paths).toEqual([
      "openspec/changes/add-worker/proposal.md",
      "openspec/changes/add-worker/design.md",
      "openspec/changes/add-worker/tasks.md",
      "openspec/changes/add-worker/specs/coding-worker/spec.md",
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails explicitly when a declared capability spec is missing", async () => {
    await expect(
      resolveOpenSpecArtifacts(
        "communitymesh/app",
        "main",
        "add-worker",
        undefined,
        successFetcher(false),
      ),
    ).rejects.toMatchObject({
      name: "OpenSpecResolutionError",
      code: "spec_not_found",
    });
  });

  it("rejects malformed capability paths rather than fetching outside the change", async () => {
    const maliciousProposal = proposal.replace(
      "coding-worker",
      "../other-capability",
    );
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/git/trees/main")) {
        return githubResponse({
          tree: [
            "openspec/changes/add-worker/proposal.md",
            "openspec/changes/add-worker/design.md",
            "openspec/changes/add-worker/tasks.md",
          ].map((path) => ({ path, type: "blob" })),
        });
      }
      return githubResponse({
        type: "file",
        encoding: "base64",
        content: btoa(maliciousProposal),
      });
    });

    await expect(
      resolveOpenSpecArtifacts("communitymesh/app", "main", "add-worker", undefined, fetcher),
    ).rejects.toBeInstanceOf(OpenSpecResolutionError);
  });
});
