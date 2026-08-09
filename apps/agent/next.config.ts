import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@clbipp/ui", "@clbipp/auth", "@clbipp/database"],
};

export default nextConfig;
