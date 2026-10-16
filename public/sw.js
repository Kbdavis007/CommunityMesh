const CACHE_PREFIX = "communitymesh-shell-";
const CACHE_VERSION = "v1";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/communitymesh.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const shellResponse = await fetch("/index.html");
      if (!shellResponse.ok) {
        throw new Error(`App shell request failed with ${shellResponse.status}`);
      }

      const html = await shellResponse.clone().text();
      const bundledAssets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
        .map((match) => match[1])
        .filter((asset) => asset.startsWith("/"));
      const assets = [...new Set([...APP_SHELL, ...bundledAssets])];
      await cache.put("/index.html", shellResponse);
      await Promise.all(
        assets
          .filter((asset) => asset !== "/index.html")
          .map(async (asset) => {
            const response = await fetch(asset);
            if (!response.ok) {
              throw new Error(`App shell asset ${asset} failed with ${response.status}`);
            }
            await cache.put(asset, response);
          }),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedShell = await cache.match("/index.html");
        if (!cachedShell) {
          throw new Error("Offline app shell is not cached.");
        }
        return cachedShell;
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request)),
  );
});
