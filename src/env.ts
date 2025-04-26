import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets";
import { z } from "zod";

export const env = createEnv({
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },
  extends: [vercel()],
  server: {
    BETTER_AUTH_SECRET: z.string(),
    DATABASE_AUTH_TOKEN: z.string(),
    DATABASE_URL: z.string(),
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
  },
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  skipValidation: Boolean(process.env.CI),
});
