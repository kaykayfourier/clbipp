import type { NextConfig } from "next";
import path from "path";

// Mirrors apps/customer/next.config.ts deliberately — every line below exists
// because of a bug the customer app already hit. Keep the two in step.
const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript (just-in-time packages) — Next
  // transpiles them; there is no per-package build step to maintain.
  transpilePackages: ["@clbipp/ui", "@clbipp/core", "@clbipp/auth", "@clbipp/database", "@clbipp/pdf"],

  // @react-pdf/renderer is left OUT of the bundle and required at runtime
  // instead: it reaches for fs/path to resolve fonts, which the bundler either
  // breaks or drags a shim in for. Batch 7B's chain-of-custody PDF is the only
  // thing here that touches it, and only in a Node route handler.
  serverExternalPackages: ["@react-pdf/renderer"],

  // Pin the tracing root at the monorepo root so the inference can't drift if a
  // second lockfile ever appears under apps/.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // Prisma's query engine is a native binary loaded by a path Prisma computes
  // at runtime, so the tracer never follows it and it must be forced in.
  //
  // It has to be traced from INSIDE the app: `scripts/copy-prisma-engine.mjs`
  // (npm prebuild) copies it here from packages/database first. Tracing it at
  // its real path instead ships the file but to a directory Prisma does not
  // search once the client is bundled — the build goes green and every query
  // 500s. See the script's header, and the customer-side confirmation from
  // Vercel runtime logs, 2026-08-15.
  outputFileTracingIncludes: {
    "/**": ["./src/generated/client/**/*"],
  },
};

export default nextConfig;
