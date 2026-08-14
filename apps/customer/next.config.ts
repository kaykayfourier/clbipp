import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@clbipp/ui", "@clbipp/core", "@clbipp/auth", "@clbipp/database", "@clbipp/pdf"],
  serverExternalPackages: ["@react-pdf/renderer"],

  // Anchor tracing at the monorepo root so relative includes resolve
  // consistently regardless of where Next infers the project root.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  outputFileTracingIncludes: {
    "/**": ["../../packages/database/src/generated/client/**/*"],
  },
};

export default nextConfig;