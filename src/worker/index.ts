import {
  handleCodingFleetMonitor,
  handleCodingRequestBatch,
} from "./coding-fleet/boss";
import { createHubAgentProfile } from "./coding-fleet/profile-management";

const jsonHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export async function handleRequest(
  request: Request,
  env?: Env,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/v1/health") {
    if (request.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "method_not_allowed" }),
        { status: 405, headers: { ...jsonHeaders, allow: "GET" } },
      );
    }

    return new Response(
      JSON.stringify({ status: "ok", apiVersion: "v1" }),
      { status: 200, headers: jsonHeaders },
    );
  }

  const profileRoute = /^\/api\/v1\/hubs\/([^/]+)\/coding-agent-profiles$/
    .exec(url.pathname);
  if (profileRoute !== null) {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "method_not_allowed" }),
        { status: 405, headers: { ...jsonHeaders, allow: "POST" } },
      );
    }
    if (env === undefined) {
      return new Response(
        JSON.stringify({ error: "profile_authorization_unavailable" }),
        { status: 503, headers: jsonHeaders },
      );
    }
    const communityId = profileRoute[1];
    if (communityId === undefined) {
      return new Response(
        JSON.stringify({ error: "invalid_community_id" }),
        { status: 400, headers: jsonHeaders },
      );
    }
    return createHubAgentProfile(request, env, communityId);
  }

  return new Response(
    JSON.stringify({ error: "not_found" }),
    { status: 404, headers: jsonHeaders },
  );
}

const worker: ExportedHandler<Env> = {
  fetch: (request, env) => handleRequest(request, env),
  scheduled: (_controller, env) => handleCodingFleetMonitor(env),
  queue: (batch, env) => {
    if (batch.queue !== "coding_requests_queue") {
      for (const message of batch.messages) {
        message.retry({ delaySeconds: 30 });
      }
      return Promise.resolve();
    }
    return handleCodingRequestBatch(batch, env);
  },
};

export default worker;
