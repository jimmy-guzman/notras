import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { KIND_VALUES } from "@/lib/kind";

import { user } from "./users";

export const note = sqliteTable("note", {
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  id: text("id").primaryKey(),
  kind: text("kind", { enum: KIND_VALUES }),
  pinnedAt: integer("pinned_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(
      () => {
        return user.id;
      },
      { onDelete: "cascade" },
    ),
});
