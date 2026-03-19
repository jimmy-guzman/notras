import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Context, Effect, Layer } from "effect";

import { env } from "@/env";

import { ensureFts } from "./fts";
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

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export class Database extends Context.Tag("Database")<Database, DrizzleDb>() {}

export const DatabaseLive = Layer.scoped(
  Database,
  Effect.acquireRelease(
    Effect.tryPromise(async () => {
      const client = createClient({ url: env.DATABASE_PATH });

      await ensureFts(client);

      return { client, db: drizzle(client, { schema }) };
    }),
    ({ client }) => {
      return Effect.sync(() => {
        client.close();
      });
    },
  ).pipe(Effect.map(({ db }) => db)),
);
