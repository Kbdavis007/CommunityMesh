import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("PWA shell", () => {
  it("declares installable standalone metadata and an app icon", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(projectRoot, "public/manifest.webmanifest"), "utf8"),
    ) as {
      display: string;
      start_url: string;
      scope: string;
      icons: Array<{ src: string; type: string }>;
    };

    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.icons).toContainEqual({
      src: "/icons/communitymesh.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable",
    });
  });

  it("links the manifest and registers a versioned offline shell worker", async () => {
    const html = await readFile(resolve(projectRoot, "index.html"), "utf8");
    const worker = await readFile(resolve(projectRoot, "public/sw.js"), "utf8");

    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(worker).toContain('const CACHE_VERSION = "v1"');
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('cache.match("/index.html")');
  });

  it("opens the cached application shell after a network failure", async () => {
    const worker = await readFile(resolve(projectRoot, "public/sw.js"), "utf8");
    type WorkerEvent = {
      waitUntil?: (promise: Promise<unknown>) => void;
      request?: { method: string; url: string; mode: string };
      respondWith?: (promise: Promise<Response>) => void;
    };
    const handlers = new Map<string, (event: WorkerEvent) => void>();
    const cacheEntries = new Map<string, Response>();
    const cache = {
      put: async (key: string, response: Response) => {
        cacheEntries.set(key, response);
      },
      match: async (key: string) => cacheEntries.get(key),
    };
    const caches = {
      open: async () => cache,
      keys: async () => ["communitymesh-shell-v1"],
      delete: async () => true,
      match: async (key: string) => cacheEntries.get(key),
    };
    let offline = false;
    const fetchAsset = async (input: string | { url: string }) => {
      if (offline) {
        throw new Error("Network unavailable.");
      }
      const url = typeof input === "string" ? input : input.url;
      if (url === "/index.html") {
        return new Response(
          '<html><script src="/assets/app.js"></script><link href="/assets/app.css"></html>',
          { status: 200 },
        );
      }
      return new Response(url, { status: 200 });
    };
    const self = {
      location: { origin: "https://communitymesh.test" },
      clients: { claim: async () => undefined },
      addEventListener: (name: string, handler: (event: WorkerEvent) => void) => {
        handlers.set(name, handler);
      },
    };

    runInNewContext(worker, {
      self,
      caches,
      fetch: fetchAsset,
      URL,
      Promise,
      Set,
      Error,
    });

    let installPromise: Promise<unknown> = Promise.resolve();
    handlers.get("install")?.({
      waitUntil: (promise) => {
        installPromise = promise ?? Promise.resolve();
      },
    });
    await installPromise;
    expect(cacheEntries.has("/assets/app.js")).toBe(true);

    offline = true;
    let offlineResponse: Promise<Response> | undefined;
    handlers.get("fetch")?.({
      request: {
        method: "GET",
        url: "https://communitymesh.test/listings",
        mode: "navigate",
      },
      respondWith: (promise) => {
        offlineResponse = promise;
      },
    });

    const response = await offlineResponse;
    expect(response?.status).toBe(200);
    expect(await response?.text()).toContain("/assets/app.js");
  });
});
