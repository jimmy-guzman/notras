import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { user } from "./users";

export const folder = sqliteTable(
  "folder",
  {
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(
        () => {
          return user.id;
        },
        { onDelete: "cascade" },
      ),
  },
  (table) => {
    return [unique("folder_user_id_name_unique").on(table.userId, table.name)];
  },
);

export type SelectFolder = typeof folder.$inferSelect;
