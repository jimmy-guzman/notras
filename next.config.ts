import type { NextConfig } from "next";

import "./src/env";

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    nodeMiddleware: true,
  },
  images: {
    remotePatterns: [{ hostname: "avatars.githubusercontent.com" }],
  },
} satisfies NextConfig;

export default nextConfig;
