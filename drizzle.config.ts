import type { Config } from "drizzle-kit";

import { env } from "./src/env";

export default {
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/server/db/schemas",
} satisfies Config;
