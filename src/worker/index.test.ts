import { describe, expect, it } from "vitest";
import { handleRequest } from "./index";

describe("versioned Worker health route", () => {
  it("returns a non-cacheable v1 health response", async () => {
    const response = await handleRequest(
      new Request("https://api.communitymesh.test/api/v1/health"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", apiVersion: "v1" });
  });

  it("rejects unsupported health methods", async () => {
    const response = await handleRequest(
      new Request(
        "https://api.communitymesh.test/api/v1/health",
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("returns a JSON not-found response for unknown paths", async () => {
    const response = await handleRequest(
      new Request("https://api.communitymesh.test/unknown"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
