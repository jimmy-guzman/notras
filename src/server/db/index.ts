import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

import { Context } from "effect";

import * as tables from "./schema";

export const schema = tables;

export type DrizzleDb = SqliteRemoteDatabase<typeof schema>;

/**
 * Read-only handle on the derived search index. The concrete driver is
 * injected by an adapter (Tauri in the app, an in-memory stub in tests) so
 * this module stays free of any platform APIs.
 */
export class Database extends Context.Tag("Database")<Database, DrizzleDb>() {}
