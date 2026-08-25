import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript (just-in-time packages) — Next
  // transpiles them; there is no per-package build step to maintain.
  transpilePackages: ["@clbipp/ui", "@clbipp/core", "@clbipp/auth", "@clbipp/database", "@clbipp/pdf"],

  // @react-pdf/renderer is left OUT of the bundle and required at runtime
  // instead: it reaches for fs/path to resolve fonts, which the bundler either
  // breaks or drags a shim in for. It only ever runs in the Node route handler
  // at /api/documents, so externalising it costs nothing.
  serverExternalPackages: ["@react-pdf/renderer"],

  // Pin the tracing root at the monorepo root. Next already infers this from
  // the root lockfile, so it changes nothing today — it's here to stop the
  // inference drifting if a second lockfile ever appears under apps/.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // Prisma's query engine is a native binary loaded by a path Prisma computes
  // at runtime, so the tracer never follows it and it must be forced in.
  //
  // It has to be traced from INSIDE the app: `scripts/copy-prisma-engine.mjs`
  // (npm prebuild) copies it here from packages/database first. Tracing it at
  // its real path instead ships the file but to a directory Prisma does not
  // search once the client is bundled — the build goes green and every query
  // 500s. See the script's header for the full reasoning.
  // Serves the Digital Asset Links file at the exact path Android looks for.
  // It cannot be an app/ route folder: Next ignores directories beginning with
  // a dot, so `app/.well-known/` is never registered. The handler lives at
  // /api/assetlinks and is rewritten here.
  //
  // ⚠ `/.well-known` is also excluded in src/proxy.ts. Android fetches this
  // anonymously at install time — behind the auth guard it would 307 to /login
  // and verification would fail. Same trap that made the icons un-fetchable.
  async rewrites() {
    return [
      { source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" },
    ];
  },

  // ─── Security headers ──────────────────────────────────────────────────────
  // Applied to every response. Kept IDENTICAL in the other app's next.config.ts
  // — change both together.
  //
  // DENY rather than SAMEORIGIN: nothing in either app frames its own pages
  // (no <iframe>/<embed> anywhere in the repo, checked 2026-08-25), so the
  // stricter value costs nothing today and stops the login form being framed
  // by a third-party page to harvest clicks against a live session.
  //
  // nosniff stops the browser re-interpreting a response as a type it was not
  // served as. That matters here because both apps accept user-uploaded photos
  // (booking photos, agent intake photos) through Supabase Storage.
  //
  // Referrer-Policy is already most browsers' default; it is pinned because
  // pickup ids and the /t/ tracking token travel in URL paths, and the token is
  // a forwardable bearer capability — it must not ride along in a Referer
  // header to a third-party origin.
  //
  // ⚠ Deliberately NO Content-Security-Policy. Next injects inline hydration
  // scripts, so a real CSP needs nonces threaded through the document; a wrong
  // one builds green and white-screens production. Worth doing as its own
  // change with its own smoke run, not smuggled in alongside two static
  // strings that cannot break a rendering page.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },

  outputFileTracingIncludes: {
    "/**": ["./src/generated/client/**/*"],
  },
};

export default nextConfig;
