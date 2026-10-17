import {
  AgentProfileConfigurationError,
  assertHubProfileWithinBaseline,
  parseAgentProfileConfiguration,
} from "./agent-governance";

interface SupabaseUser {
  id: string;
}

interface HubProfileInput {
  profileId: string;
  version: number;
  profile: unknown;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function parseHubProfileInput(value: unknown): HubProfileInput | null {
  if (
    !isRecord(value)
    || typeof value.profileId !== "string"
    || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(value.profileId)
    || typeof value.version !== "number"
    || !Number.isSafeInteger(value.version)
    || value.version <= 0
    || !("profile" in value)
    || !isRecord(value.profile)
  ) {
    return null;
  }
  return {
    profileId: value.profileId,
    version: value.version,
    profile: value.profile,
  };
}

async function authorizeCommunityAdmin(
  request: Request,
  env: Env,
  communityId: string,
): Promise<SupabaseUser | Response> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (token === undefined) return jsonResponse(401, { error: "authentication_required" });
  if (env.SUPABASE_URL === undefined || env.SUPABASE_ANON_KEY === undefined) {
    return jsonResponse(503, { error: "profile_authorization_unavailable" });
  }

  const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const headers = {
    apikey: env.SUPABASE_ANON_KEY,
    authorization: `Bearer ${token}`,
  };
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers });
  if (userResponse.status === 401 || userResponse.status === 403) {
    return jsonResponse(401, { error: "invalid_authentication" });
  }
  if (!userResponse.ok) {
    return jsonResponse(503, { error: "profile_authorization_unavailable" });
  }
  const userValue: unknown = await userResponse.json();
  if (!isRecord(userValue) || typeof userValue.id !== "string" || !isUuid(userValue.id)) {
    return jsonResponse(502, { error: "invalid_identity_response" });
  }

  const membershipUrl = new URL(`${supabaseUrl}/rest/v1/community_memberships`);
  membershipUrl.searchParams.set("select", "community_id");
  membershipUrl.searchParams.set("community_id", `eq.${communityId}`);
  membershipUrl.searchParams.set("user_id", `eq.${userValue.id}`);
  membershipUrl.searchParams.set("role", "eq.admin");
  membershipUrl.searchParams.set("status", "eq.active");
  const membershipResponse = await fetch(membershipUrl, { headers });
  if (!membershipResponse.ok) {
    return jsonResponse(503, { error: "profile_authorization_unavailable" });
  }
  const membershipValue: unknown = await membershipResponse.json();
  if (
    !Array.isArray(membershipValue)
    || !membershipValue.some((membership) =>
      isRecord(membership) && membership.community_id === communityId
    )
  ) {
    return jsonResponse(403, { error: "community_admin_required" });
  }
  return { id: userValue.id };
}

export async function createHubAgentProfile(
  request: Request,
  env: Env,
  communityId: string,
): Promise<Response> {
  if (!isUuid(communityId)) return jsonResponse(400, { error: "invalid_community_id" });
  const authorization = await authorizeCommunityAdmin(request, env, communityId);
  if (authorization instanceof Response) return authorization;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return jsonResponse(415, { error: "application_json_required" });
  }
  const body = await request.text();
  if (body.length > 65536) return jsonResponse(413, { error: "profile_too_large" });

  let bodyValue: unknown;
  try {
    bodyValue = JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonResponse(400, { error: "invalid_json" });
    }
    throw error;
  }
  const input = parseHubProfileInput(bodyValue);
  if (input === null) return jsonResponse(400, { error: "invalid_profile_request" });

  let hubProfile;
  try {
    hubProfile = parseAgentProfileConfiguration(input.profile, communityId, "hub");
  } catch (error) {
    if (error instanceof AgentProfileConfigurationError) {
      return jsonResponse(400, { error: error.code, message: error.message });
    }
    throw error;
  }

  const baselineReference = hubProfile.baselineProfile;
  if (baselineReference === undefined) {
    return jsonResponse(400, { error: "platform_baseline_required" });
  }
  const baselineRow = await env.DB.prepare(`
    SELECT profile_json
    FROM coding_agent_profiles
    WHERE scope_kind = 'platform' AND scope_id = 'platform'
      AND profile_id = ?1 AND version = ?2 AND status = 'approved'
  `).bind(baselineReference.profileId, baselineReference.version)
    .first<{ profile_json: string }>();
  if (baselineRow === null) {
    return jsonResponse(409, { error: "platform_baseline_unavailable" });
  }

  let baselineValue: unknown;
  try {
    baselineValue = JSON.parse(baselineRow.profile_json);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonResponse(409, { error: "invalid_platform_baseline" });
    }
    throw error;
  }
  try {
    const baseline = parseAgentProfileConfiguration(
      baselineValue,
      communityId,
      "platform",
    );
    assertHubProfileWithinBaseline(hubProfile, baseline);
  } catch (error) {
    if (error instanceof AgentProfileConfigurationError) {
      return jsonResponse(403, { error: error.code, message: error.message });
    }
    throw error;
  }

  for (const skill of hubProfile.requiredSkills) {
    const approved = await env.DB.prepare(`
      SELECT 1 AS approved
      FROM coding_skill_versions
      WHERE scope_kind = ?1 AND scope_id = ?2 AND skill_id = ?3
        AND version = ?4 AND governance_status = 'approved'
    `).bind(skill.scopeKind, skill.scopeId, skill.skillId, skill.version)
      .first<{ approved: number }>();
    if (approved === null) {
      return jsonResponse(409, {
        error: "required_skill_unavailable",
        skillId: skill.skillId,
        version: skill.version,
      });
    }
  }

  const result = await env.DB.prepare(`
    INSERT INTO coding_agent_profiles (
      scope_kind, scope_id, profile_id, version, profile_json, status, created_by
    ) VALUES ('hub', ?1, ?2, ?3, ?4, 'approved', ?5)
    ON CONFLICT (scope_kind, scope_id, profile_id, version) DO NOTHING
  `).bind(
    communityId,
    input.profileId,
    input.version,
    JSON.stringify(input.profile),
    authorization.id,
  ).run();
  if ((result.meta.changes ?? 0) === 0) {
    return jsonResponse(409, { error: "profile_version_already_exists" });
  }
  return jsonResponse(201, {
    communityId,
    profileId: input.profileId,
    version: input.version,
    status: "approved",
  });
}
