"use client";

import { useEffect } from "react";

// Registers the hand-rolled service worker (public/sw.js). Renders nothing.
// Production-only: a SW in dev interferes with Next/Turbopack HMR (stale caches,
// reload loops), so we skip it unless NODE_ENV is production.
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
