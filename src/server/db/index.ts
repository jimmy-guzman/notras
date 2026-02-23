import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "@/env";

import * as notes from "./schemas/notes";
import * as users from "./schemas/users";

const schema = {
  ...users,
  ...notes,
};

export function createDb(databasePath: string) {
  const client = createClient({ url: databasePath });

  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

export const db = createDb(env.DATABASE_PATH);
