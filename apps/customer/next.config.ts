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

  outputFileTracingIncludes: {
    "/**": ["./src/generated/client/**/*"],
  },
};

export default nextConfig;
