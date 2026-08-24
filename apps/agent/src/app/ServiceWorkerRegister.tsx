"use client";

import { useEffect } from "react";

// Registers the hand-rolled service worker (public/sw.js). Renders nothing.
// Twin of apps/customer/src/app/ServiceWorkerRegister.tsx — kept as a per-app
// file rather than shared from packages/ui because it is four lines of glue and
// the two apps register different scopes.
//
// Production-only: a SW in dev interferes with Next/Turbopack HMR (stale caches,
// reload loops), so we skip it unless NODE_ENV is production.
//
// ⚠ Consequence worth knowing: `npm run dev:agent` will NOT be installable and
// will NOT show the install prompt, because both need a registered service
// worker. Check install behaviour with `npm run build && npm start`, or on the
// deployed URL — not on the dev server.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[sw] registration failed:", err);
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
