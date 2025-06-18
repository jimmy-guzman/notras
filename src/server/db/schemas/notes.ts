import { jsonb, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";

import { KIND_VALUES } from "@/lib/kind";

import { user } from "./users";

interface NoteMetadata {
  aiKindInferred?: boolean;
}

export const note = pgTable("note", {
  aiCreatedAt: timestamp("ai_created_at", { mode: "date" }),
  aiUpdatedAt: timestamp("ai_updated_at", { mode: "date" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
  embedding: vector("embedding", { dimensions: 1536 }),
  id: text("id").primaryKey(),
  kind: text("kind", { enum: KIND_VALUES }),
  metadata: jsonb("metadata").$type<NoteMetadata>(),
  pinnedAt: timestamp("pinned_at", { mode: "date" }),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
