import type { Config } from "drizzle-kit";

import { env } from "@/env";

export default {
  dbCredentials: {
    authToken: env.DATABASE_AUTH_TOKEN,
    url: env.DATABASE_URL,
  },
  dialect: "sqlite",
  driver: "turso",
  out: "./drizzle",
  schema: "./src/server/db/schemas",
} satisfies Config;
