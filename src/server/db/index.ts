import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "@/env";

import * as assets from "./schemas/assets";
import * as folders from "./schemas/folders";
import * as links from "./schemas/links";
import * as notes from "./schemas/notes";
import * as tags from "./schemas/tags";
import * as users from "./schemas/users";

const schema = {
  ...users,
  ...folders,
  ...notes,
  ...assets,
  ...links,
  ...tags,
};

export function createDb(databasePath: string) {
  const client = createClient({ url: databasePath });

  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

let _db: Database | undefined;

export function getDb() {
  _db ??= createDb(env.DATABASE_PATH);

  return _db;
}
