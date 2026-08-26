import type { NextConfig } from "next";
import path from "path";

// Mirrors apps/agent/next.config.ts, which mirrors apps/customer's. Every line
// below exists because of a bug one of the other two apps already hit.
//
// Two deliberate DIFFERENCES from the agent app, both because admin is a
// desktop console and not a PWA (AD11, R5):
//   · No /.well-known/assetlinks.json rewrite — there is no Android TWA here.
//   · No manifest/sw/icon exclusions needed in the proxy matcher, because
//     apps/admin/public/ holds nothing that must load logged out.
// If either of those ever changes, trap 2 applies: anything added to public/
// must ALSO be excluded in src/proxy.ts's matcher, by filename.
const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript (just-in-time packages) — Next
  // transpiles them; there is no per-package build step to maintain.
  transpilePackages: [
    "@clbipp/ui",
    "@clbipp/core",
    "@clbipp/auth",
    "@clbipp/database",
    "@clbipp/pdf",
    "@clbipp/decision-engine",
  ],

  // @react-pdf/renderer is left OUT of the bundle and required at runtime
  // instead: it reaches for fs/path to resolve fonts, which the bundler either
  // breaks or drags a shim in for. Batch 7 mints the EPR certificate PDF
  // through it, in a Node route handler.
  serverExternalPackages: ["@react-pdf/renderer"],

  // Pin the tracing root at the monorepo root so the inference can't drift if a
  // second lockfile ever appears under apps/.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // ─── Security headers ──────────────────────────────────────────────────────
  // Kept IDENTICAL to the other two apps' next.config.ts — change all three
  // together. Full reasoning lives in apps/agent/next.config.ts; the short
  // version: DENY because nothing frames its own pages, nosniff because both
  // other apps serve user-uploaded photos, and Referrer-Policy because pickup
  // ids travel in URL paths.
  //
  // ⚠ Deliberately NO Content-Security-Policy, same as the other two.
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

  // Prisma's query engine is a native binary loaded by a path Prisma computes
  // at runtime, so the tracer never follows it and it must be forced in. It has
  // to be traced from INSIDE the app — scripts/copy-prisma-engine.mjs (npm
  // prebuild) copies it here first. See that script's header.
  outputFileTracingIncludes: {
    "/**": ["./src/generated/client/**/*"],
  },
};

export default nextConfig;
