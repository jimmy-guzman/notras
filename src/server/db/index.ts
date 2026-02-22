import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/env";

import * as notes from "./schemas/notes";
import * as users from "./schemas/users";

const schema = {
  ...users,
  ...notes,
};

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);

  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;

export const db = createDb(env.DATABASE_URL);
