import type { AdapterAccount } from "next-auth/adapters";

import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-zod";

import { themes } from "@/constants/themes";

export const users = sqliteTable("user", {
  email: text("email").notNull(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  id: text("id").notNull().primaryKey(),
  image: text("image"),
  name: text("name"),
  theme: text("theme", { enum: themes }).default("dark").notNull(),
});

export const selectUserSchema = createSelectSchema(users);

export const accounts = sqliteTable(
  "account",
  {
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    id_token: text("id_token"),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    scope: text("scope"),
    session_state: text("session_state"),
    token_type: text("token_type"),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    userId: text("userId")
      .notNull()
      .references(
        () => {
          return users.id;
        },
        { onDelete: "cascade" },
      ),
  },
  (account) => {
    return {
      compoundKey: primaryKey({
        columns: [account.provider, account.providerAccountId],
      }),
    };
  },
);

export const sessions = sqliteTable("session", {
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  sessionToken: text("sessionToken").notNull().primaryKey(),
  userId: text("userId")
    .notNull()
    .references(
      () => {
        return users.id;
      },
      { onDelete: "cascade" },
    ),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
  },
  (vt) => {
    return {
      compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
    };
  },
);
