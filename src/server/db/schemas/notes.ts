import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./users";

export const note = pgTable("note", {
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
  id: text("id").primaryKey(),
  pinnedAt: timestamp("pinned_at", { mode: "date" }),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export type SelectNote = typeof note.$inferSelect;
