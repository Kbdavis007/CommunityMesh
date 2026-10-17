import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHubAgentProfile } from "./profile-management";

const migrations = [
  "0001_governance_ledger.sql",
  "0002_sync_change_feed.sql",
  "0003_coding_task_fleet.sql",
].map((name) => readFileSync(resolve(process.cwd(), "migrations/d1", name), "utf8"));

const communityId = "00000000-0000-4000-8000-000000000001";
const otherCommunityId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

function testDatabase() {
  const database = new DatabaseSync(":memory:");
  for (const migration of migrations) database.exec(migration);
  database.prepare(`
    insert into coding_agent_profiles (
      scope_kind, scope_id, profile_id, version, profile_json, status, created_by
    ) values (
      'platform', 'platform', 'agent-baseline', 1, ?, 'approved', 'operator'
    )
  `).run(JSON.stringify({
    taskTypes: ["feature_impl", "refactor", "test_writer", "doc_writer", "bug_fix"],
    requiredSkills: [],
    allowedRepositoryPaths: ["src/**", "tests/**", "openspec/**"],
    allowedSpecPaths: ["openspec/**"],
    allowedOperations: [
      "read",
      "write",
      "run_tests",
      "openspec_validate",
      "create_branch",
      "schema_change",
    ],
    resourceLimits: {
      maxTokens: 20000,
      maxFiles: 40,
      maxDurationSeconds: 3600,
      maxDiffBytes: 1000000,
    },
  }));

  const prepare = (sql: string) => {
    let bindings: SQLInputValue[] = [];
    const statement = {
      bind(...values: SQLInputValue[]) {
        bindings = values;
        return statement;
      },
      async first<T>() {
        return database.prepare(sql).get(...bindings) as T | undefined ?? null;
      },
      async run() {
        const result = database.prepare(sql).run(...bindings);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return statement;
  };
  return {
    database,
    d1: { prepare },
  };
}

function profileRequest(
  community = communityId,
  profile: unknown = {
    baselineProfile: { profileId: "agent-baseline", version: 1 },
    taskTypes: ["feature_impl"],
    requiredSkills: [],
    allowedRepositoryPaths: ["src/features/**"],
    allowedSpecPaths: ["openspec/changes/**"],
    allowedOperations: ["read", "write", "run_tests", "openspec_validate", "create_branch"],
    resourceLimits: {
      maxTokens: 10000,
      maxFiles: 10,
      maxDurationSeconds: 1800,
      maxDiffBytes: 250000,
    },
  },
) {
  return new Request(
    `https://api.communitymesh.test/api/v1/hubs/${community}/coding-agent-profiles`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer valid-user-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ profileId: "agent-hub", version: 1, profile }),
    },
  );
}

function createEnv(d1: ReturnType<typeof testDatabase>["d1"]) {
  return {
    DB: d1,
    SUPABASE_URL: "https://supabase.communitymesh.test",
    SUPABASE_ANON_KEY: "test-anon-key",
  } as unknown as Env;
}

function authorizedSupabaseFetch(memberCommunityId: string) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/auth/v1/user")) {
      return Response.json({ id: userId });
    }
    if (url.pathname.endsWith("/rest/v1/community_memberships")) {
      return Response.json([{ community_id: memberCommunityId }]);
    }
    return new Response(null, { status: 404 });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hub agent profile management", () => {
  it("creates an immutable hub profile under the verified community admin identity", async () => {
    const { database, d1 } = testDatabase();
    vi.stubGlobal("fetch", authorizedSupabaseFetch(communityId));

    const response = await createHubAgentProfile(
      profileRequest(),
      createEnv(d1),
      communityId,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      communityId,
      profileId: "agent-hub",
      version: 1,
      status: "approved",
    });
    expect(database.prepare(`
      select scope_kind, scope_id, created_by, status
      from coding_agent_profiles where profile_id = 'agent-hub'
    `).get()).toEqual({
      scope_kind: "hub",
      scope_id: communityId,
      created_by: userId,
      status: "approved",
    });
    database.close();
  });

  it("denies a member who is not an admin of the target community", async () => {
    const { database, d1 } = testDatabase();
    vi.stubGlobal("fetch", authorizedSupabaseFetch(otherCommunityId));

    const response = await createHubAgentProfile(
      profileRequest(),
      createEnv(d1),
      communityId,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "community_admin_required" });
    expect(
      database.prepare(`
        select count(*) as count from coding_agent_profiles where scope_kind = 'hub'
      `).get(),
    ).toEqual({ count: 0 });
    database.close();
  });

  it("rejects hub settings that widen the platform baseline", async () => {
    const { database, d1 } = testDatabase();
    vi.stubGlobal("fetch", authorizedSupabaseFetch(communityId));
    const widenedProfile = {
      baselineProfile: { profileId: "agent-baseline", version: 1 },
      taskTypes: ["feature_impl"],
      requiredSkills: [],
      allowedRepositoryPaths: ["**"],
      allowedSpecPaths: ["openspec/changes/**"],
      allowedOperations: ["read", "write"],
      resourceLimits: {
        maxTokens: 10000,
        maxFiles: 10,
        maxDurationSeconds: 1800,
        maxDiffBytes: 250000,
      },
    };

    const response = await createHubAgentProfile(
      profileRequest(communityId, widenedProfile),
      createEnv(d1),
      communityId,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "profile_exceeds_baseline" });
    expect(
      database.prepare(`
        select count(*) as count from coding_agent_profiles where scope_kind = 'hub'
      `).get(),
    ).toEqual({ count: 0 });
    database.close();
  });

  it("requires authentication before reading or writing profile configuration", async () => {
    const { database, d1 } = testDatabase();
    const request = new Request(
      `https://api.communitymesh.test/api/v1/hubs/${communityId}/coding-agent-profiles`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    const response = await createHubAgentProfile(request, createEnv(d1), communityId);

    expect(response.status).toBe(401);
    expect(
      database.prepare(`
        select count(*) as count from coding_agent_profiles where scope_kind = 'hub'
      `).get(),
    ).toEqual({ count: 0 });
    database.close();
  });
});
