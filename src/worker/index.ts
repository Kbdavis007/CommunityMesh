const jsonHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export async function handleRequest(
  request: Pick<Request, "method" | "url">,
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

  return new Response(
    JSON.stringify({ error: "not_found" }),
    { status: 404, headers: jsonHeaders },
  );
}

const worker: ExportedHandler<Env> = {
  fetch: (request) => handleRequest(request),
};

export default worker;
