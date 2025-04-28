import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },
  server: {
    BETTER_AUTH_SECRET: z.string(),
    DATABASE_AUTH_TOKEN: z.string(),
    DATABASE_URL: z.string(),
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
    RESEND_API_KEY: z.string(),
    RESEND_FROM_EMAIL: z.string(),
  },
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  skipValidation:
    Boolean(process.env.CI) || process.env.SKIP_ENV_VALIDATION === "1",
});
