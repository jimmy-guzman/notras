import { invoke } from "@tauri-apps/api/core";
import { drizzle } from "drizzle-orm/sqlite-proxy";

import { schema } from "@/server/db";

/**
 * Drizzle over the Rust `db_select` command. The index has exactly one
 * writer (Rust), so every statement crossing this bridge is a SELECT --
 * the command rejects anything else.
 */
export function makeTauriDatabase() {
  return drizzle<typeof schema>(
    async (sql, params, method) => {
      const rows = await invoke<unknown[][]>("db_select", { params, sql });

      return { rows: method === "get" ? (rows[0] ?? []) : rows };
    },
    { schema },
  );
}
