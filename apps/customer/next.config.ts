import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript (just-in-time packages) — Next
  // transpiles them; there is no per-package build step to maintain.
  transpilePackages: ["@clbipp/ui", "@clbipp/core", "@clbipp/auth", "@clbipp/database", "@clbipp/pdf"],

  // @react-pdf/renderer is left OUT of the bundle and required at runtime
  // instead: it reaches for fs/path to resolve fonts, which the bundler either
  // breaks or drags a shim in for. It only ever runs in the Node route handler
  // at /api/documents, so externalising it costs nothing.
  serverExternalPackages: ["@react-pdf/renderer"],

  // Prisma's query engine binary lives in the workspace package, outside
  // apps/customer — Next's file tracer doesn't follow the dynamic require
  // Prisma uses to load it, so it gets silently dropped from the deployed
  // function bundle. Force it in explicitly.
  outputFileTracingIncludes: {
    "/**": ["../../packages/database/src/generated/client/**/*"],
  },
};

export default nextConfig;