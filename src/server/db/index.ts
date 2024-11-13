import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "@/env";

import { users } from "./schemas/users";

const client = createClient({
  authToken: env.DATABASE_AUTH_TOKEN,
  url: env.DATABASE_URL,
});

export const db = drizzle(client, { schema: { users } });
