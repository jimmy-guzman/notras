import type { Config } from "drizzle-kit";

export default {
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "file:./data/notras.db",
  },
  dialect: "sqlite",
  out: "./drizzle",
  schema: "./src/server/db/schemas",
} satisfies Config;
