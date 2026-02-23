import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./users";

export const note = sqliteTable("note", {
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  id: text("id").primaryKey(),
  pinnedAt: integer("pinned_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export type SelectNote = typeof note.$inferSelect;
