import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { cache } from "react";

import { env } from "@/env";
import { db } from "@/server/db";
import * as schema from "@/server/db/schemas/users";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  plugins: [nextCookies()],
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
});

export const getSession = cache(async () => {
  return await auth.api.getSession({
    headers: await headers(),
  });
});
