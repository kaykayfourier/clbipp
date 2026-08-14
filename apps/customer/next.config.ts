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

  // Prisma's query engine is a native binary loaded by a path Prisma computes
  // at runtime, so the tracer never follows it and it must be forced in.
  //
  // It has to be traced from INSIDE the app: `scripts/copy-prisma-engine.mjs`
  // (npm prebuild) copies it here from packages/database first. Tracing it at
  // its real path instead ships the file but to a directory Prisma does not
  // search once the client is bundled — the build goes green and every query
  // 500s. See the script's header for the full reasoning.
  outputFileTracingIncludes: {
    "/**": ["./src/generated/client/**/*"],
  },
};

export default nextConfig;
