import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { note } from "./notes";
import { user } from "./users";

export const asset = sqliteTable("asset", {
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  height: integer("height").notNull(),
  id: text("id").primaryKey(),
  mimeType: text("mime_type").notNull(),
  noteId: text("note_id")
    .notNull()
    .references(() => note.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  width: integer("width").notNull(),
});

export type SelectAsset = typeof asset.$inferSelect;
