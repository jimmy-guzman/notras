import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  email: text("email").notNull().unique(),
  id: text("id").primaryKey(),
  image: text("image"),
  name: text("name").notNull(),
  preferences: text("preferences"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
