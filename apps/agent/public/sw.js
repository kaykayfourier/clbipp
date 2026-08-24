// ─── Back2Basics Field Agent — hand-rolled service worker ────────────────────
// Mirrors apps/customer/public/sw.js. Same posture, deliberately: make the app
// installable and give the shell a friendly offline fallback, while caching NO
// page HTML and NO Supabase data.
//
// 🔴 The no-data rule matters more here than it does on the customer app. Every
// agent screen is agent-scoped by an in-code `agentId === user.id` check (D10)
// rather than by RLS, and agent screens show the things the vendor must never
// see — full revenue, cost lines, margin, the P_min/P_max band. A cached
// response has no session attached to it, so caching an authed page would be a
// way for those to survive a logout on a shared handset. Navigations are
// network-first with an offline fallback, and nothing authed is ever stored.
//
// The cache name is agent-specific. The two apps are separate origins in
// production, but they share `localhost` in development, where a shared cache
// key would let one app's shell answer the other's navigations.

const CACHE = "b2b-agent-shell-v1";
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
//
// ⚠ A fetch handler is also an install requirement: Chromium will not fire
// `beforeinstallprompt` for a service worker that does not handle fetch, so
// removing this would silently disable the install prompt as well as offline.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});
