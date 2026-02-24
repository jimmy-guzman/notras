import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { note } from "./notes";
import { user } from "./users";

export const link = sqliteTable(
  "link",
  {
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    description: text("description"),
    id: text("id").primaryKey(),
    noteId: text("note_id")
      .notNull()
      .references(() => note.id, { onDelete: "cascade" }),
    title: text("title"),
    url: text("url").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [unique().on(table.noteId, table.url)],
);

export type SelectLink = typeof link.$inferSelect;
