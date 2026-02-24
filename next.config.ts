import "./src/env";

import type { NextConfig } from "next";

import { execSync } from "node:child_process";

function getCommitSha() {
  try {
    return execSync("git rev-parse HEAD").toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

const commitSha = getCommitSha();

const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    ...(commitSha && { NEXT_PUBLIC_COMMIT_SHA: commitSha }),
  },
  experimental: {
    useCache: true,
  },
  output: process.env.STANDALONE === "true" ? "standalone" : undefined,
  serverExternalPackages: ["oxfmt"],
  typedRoutes: true,
} satisfies NextConfig;

export default nextConfig;
