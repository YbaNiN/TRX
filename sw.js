/* sw.js — TRX Panel (App Shell cache-first + fallback a index.html) */

const CACHE_VERSION = "v31"; // <- súbelo (v2, v3...) cuando publiques cambios
const CACHE_NAME = `trx-panel-${CACHE_VERSION}`;

// App Shell (lo imprescindible para que la PWA arranque offline)
const APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./sw.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      // Para que la actualización se instale sin esperar a cerrar pestañas:
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Limpia caches antiguas
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("trx-panel-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );

      // Toma control de las páginas abiertas
      await self.clients.claim();
    })()
  );
});

// Permite forzar "skipWaiting" desde la app (opcional)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  // Solo GET
  if (event.request.method !== "GET") return;

  const reqUrl = new URL(event.request.url);

  // Solo controlamos mismo origen
  if (reqUrl.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // 1) Cache-first: si está cacheado, devuélvelo
      const cached = await cache.match(event.request);
      if (cached) return cached;

      // 2) Red: intenta descargarlo y guardarlo (runtime cache)
      try {
        const res = await fetch(event.request);

        // Guarda solo respuestas “ok” y básicas (del mismo origen)
        if (res && res.status === 200 && res.type === "basic") {
          cache.put(event.request, res.clone());
        }
        return res;
      } catch (err) {
        // 3) Offline fallback: devuelve index.html
        // (ideal para que la app cargue aunque falte el recurso pedido)
        const navFallback = (await cache.match("./index.html")) || (await cache.match("./offline.html"));
        if (event.request.mode === "navigate") return navFallback || Response.error();
        return (await cache.match("./offline.html")) || navFallback || Response.error();
      }
    })()
  );
});
