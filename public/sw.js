const CACHE_NAME = "becleven-pwa-v29";
const STATIC_ASSETS = [
  "/",
  "/restaurant-app",
  "/chef-hat.svg",
  "/manifest.json",
  "/restaurant-app/manifest.webmanifest",
  "/favicon.ico",
  "/raj-logo.png",
  "/raj-logo-master-1024.png",
  "/icons/favicon-16.png",
  "/icons/favicon-32.png",
  "/icons/apple-touch-icon-120.png",
  "/icons/apple-touch-icon-152.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon-72.png",
  "/icons/icon-96.png",
  "/icons/icon-144.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;

      if (event.request.mode === "navigate") {
        const url = new URL(event.request.url);
        if (url.pathname === "/restaurant-app" || url.pathname.startsWith("/restaurant-app/")) {
          return caches.match("/restaurant-app") || caches.match("/");
        }
        return caches.match("/");
      }

      return Response.error();
    })
  );
});
