import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },
  server: {
    DATABASE_PATH: z.string().optional().default("file:./data/notras.db"),
  },
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
});
