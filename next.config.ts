import "./src/env";

import type { NextConfig } from "next";

const nextConfig = {
  experimental: {
    useCache: true,
  },
  images: {
    remotePatterns: [{ hostname: "avatars.githubusercontent.com" }],
  },
  typedRoutes: true,
} satisfies NextConfig;

export default nextConfig;
