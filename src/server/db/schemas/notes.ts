import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { user } from "./users";

export const note = sqliteTable("note", {
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  id: text("id").primaryKey(),
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

export const tag = sqliteTable(
  "tag",
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
  (t) => {
    return [unique().on(t.userId, t.name)];
  },
);

export const noteTag = sqliteTable("note_tag", {
  noteId: text("note_id")
    .notNull()
    .references(
      () => {
        return note.id;
      },
      { onDelete: "cascade" },
    ),
  tagId: text("tag_id")
    .notNull()
    .references(
      () => {
        return tag.id;
      },
      { onDelete: "cascade" },
    ),
});
