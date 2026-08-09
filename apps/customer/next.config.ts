import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript (just-in-time packages) — Next
  // transpiles them; there is no per-package build step to maintain.
  transpilePackages: ["@clbipp/ui", "@clbipp/core", "@clbipp/auth", "@clbipp/database"],
};

export default nextConfig;
