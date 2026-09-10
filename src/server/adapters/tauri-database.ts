import { drizzle } from "drizzle-orm/sqlite-proxy";

import { commands } from "@/server/adapters/bindings";
import { schema } from "@/server/db";

/**
 * Drizzle over the Rust `db_select` command. The index has exactly one
 * writer (Rust), so every statement crossing this bridge is a SELECT --
 * the command rejects anything else.
 */
export function makeTauriDatabase() {
  return drizzle<typeof schema>(
    async (sql, params, method) => {
      const rows = await commands.dbSelect(sql, params);

      return { rows: method === "get" ? (rows[0] ?? []) : rows };
    },
    { schema }
  );
}
