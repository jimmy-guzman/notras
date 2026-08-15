import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Drizzle mirror of the derived index that Rust creates and owns (see
 * `src-tauri/src/index.rs`). The webview only ever SELECTs from these tables;
 * there are no migrations because the whole database is disposable.
 */
export const note = sqliteTable("note", {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  folder: text("folder").notNull().default(""),
  path: text("path").primaryKey(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  title: text("title").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const noteTag = sqliteTable(
  "note_tag",
  {
    path: text("path").notNull(),
    tag: text("tag").notNull(),
  },
  (table) => {
    return [primaryKey({ columns: [table.path, table.tag] })];
  },
);

export type SelectNote = typeof note.$inferSelect;
