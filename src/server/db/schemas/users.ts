import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  id: text("id").primaryKey(),
  image: text("image"),
  name: text("name").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  id: text("id").primaryKey(),
  ipAddress: text("ip_address"),
  token: text("token").notNull().unique(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(
      () => {
        return user.id;
      },
      { onDelete: "cascade" },
    ),
});

export const account = sqliteTable("account", {
  accessToken: text("access_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  accountId: text("account_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  id: text("id").primaryKey(),
  idToken: text("id_token"),
  password: text("password"),
  providerId: text("provider_id").notNull(),
  refreshToken: text("refresh_token"),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
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

export const verification = sqliteTable("verification", {
  createdAt: integer("created_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  value: text("value").notNull(),
});
