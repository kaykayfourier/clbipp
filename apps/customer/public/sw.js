// ─── Back2Basics — hand-rolled service worker ────────────────────────────────
// Goal: make the app installable + give a friendly offline fallback for the app
// shell. This is intentionally minimal — it does NOT cache every visited page or
// any Supabase data (avoids serving stale/sensitive authed content offline).
// If a fuller offline experience is ever needed, revisit @ducanh2912/next-pwa
// (Workbox) — see docs/BATCH_A_FLAGS.md [PWA-offline].

const CACHE = "b2b-shell-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Network-first for page navigations; fall back to the offline page when the
// network is unavailable. Non-navigation / non-GET requests are left to the
// browser (no caching of API/data responses).
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});
