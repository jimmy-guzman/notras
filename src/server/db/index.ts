import { drizzle } from "drizzle-orm/libsql";

import { env } from "@/env";

import * as users from "./schemas/users";

export const db = drizzle({
  connection: {
    authToken: env.DATABASE_AUTH_TOKEN,
    url: env.DATABASE_URL,
  },
  schema: { users },
});
