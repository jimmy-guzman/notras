import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/env";

import * as notes from "./schemas/notes";
import * as users from "./schemas/users";

const sql = neon(env.DATABASE_URL);

export const db = drizzle(sql, {
  schema: {
    ...users,
    ...notes,
  },
});
