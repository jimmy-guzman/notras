// @ts-check
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti";

const jiti = createJiti(fileURLToPath(import.meta.url));

await jiti.import("./src/env");

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    nodeMiddleware: true,
  },
  images: {
    remotePatterns: [{ hostname: "avatars.githubusercontent.com" }],
  },
  async redirects() {
    return [
      {
        destination: "/settings/profile",
        permanent: true,
        source: "/settings",
      },
    ];
  },
};

export default nextConfig;
