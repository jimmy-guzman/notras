import "./src/env";

import type { NextConfig } from "next";

import { execSync } from "node:child_process";

function getCommitSha() {
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "";
  }
}

const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_COMMIT_SHA: getCommitSha(),
  },
  experimental: {
    useCache: true,
  },
  serverExternalPackages: ["oxfmt"],
  typedRoutes: true,
} satisfies NextConfig;

export default nextConfig;
