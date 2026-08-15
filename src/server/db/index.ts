import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Context, Effect, Layer } from "effect";

import { DatabaseError } from "@/core";

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

export interface DatabaseConfig {
  /** libSQL connection URL, e.g. `file:/abs/path/notras.db`. */
  url: string;
}

/**
 * Build the `Database` layer for a given connection. The URL is injected rather
 * than read from the environment so this module stays free of any framework's
 * env handling.
 */
export function makeDatabaseLayer(config: DatabaseConfig) {
  return Layer.scoped(
    Database,
    Effect.acquireRelease(
      Effect.tryPromise({
        catch: (cause) => {
          return new DatabaseError({ cause });
        },
        try: async () => {
          const client = createClient({ url: config.url });

          try {
            await ensureFts(client);
          } catch (error) {
            // acquireRelease only runs its release on success, so anything that
            // fails after createClient has to close the client itself.
            client.close();

            throw error;
          }

          return { client, db: drizzle(client, { schema }) };
        },
      }),
      ({ client }) => {
        return Effect.sync(() => {
          client.close();
        });
      },
    ).pipe(
      Effect.map(({ db }) => {
        return db;
      }),
    ),
  );
}
