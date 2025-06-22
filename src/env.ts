import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod";

const DEFAULT_PORT = "3000";

export const env = createEnv({
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },
  extends: [vercel()],
  server: {
    BETTER_AUTH_SECRET: z.string(),
    CRON_SECRET: z.string(),
    DATABASE_URL: z.string(),
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
    OPENAI_API_KEY: z.string(),
    PORT: z.string().optional().default(DEFAULT_PORT),
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
