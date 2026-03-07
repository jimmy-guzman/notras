import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Context, Effect, Layer } from "effect";

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

function createDb(databasePath: string) {
  const client = createClient({ url: databasePath });

  return drizzle(client, { schema });
}

type DrizzleDb = ReturnType<typeof createDb>;

// ---------------------------------------------------------------------------
// Database service
// ---------------------------------------------------------------------------

export class Database extends Context.Tag("Database")<Database, DrizzleDb>() {}

export const DatabaseLive = Layer.effect(
  Database,
  Effect.sync(() => createDb(env.DATABASE_PATH)),
);
