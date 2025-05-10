import {
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { note } from "./notes";

export const linkReason = pgEnum("link_reason", [
  "semantic",
  "temporal",
  "user-defined",
]);

export const noteLink = pgTable(
  "note_link",
  {
    confidence: real("confidence"), // nullable
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    fromNoteId: text("from_note_id")
      .notNull()
      .references(
        () => {
          return note.id;
        },
        { onDelete: "cascade" },
      ),
    id: text("id").primaryKey(),
    reason: linkReason("reason").notNull(),
    toNoteId: text("to_note_id")
      .notNull()
      .references(
        () => {
          return note.id;
        },
        { onDelete: "cascade" },
      ),
  },
  (table) => {
    return [unique().on(table.fromNoteId, table.toNoteId, table.reason)];
  },
);
