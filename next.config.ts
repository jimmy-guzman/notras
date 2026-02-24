import "./src/env";

import type { NextConfig } from "next";

const nextConfig = {
  experimental: {
    useCache: true,
  },
  serverExternalPackages: ["oxfmt"],
  typedRoutes: true,
} satisfies NextConfig;

export default nextConfig;
