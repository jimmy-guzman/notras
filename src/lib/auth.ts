import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { headers } from "next/headers";
import { cache } from "react";

import { env } from "@/env";
import { db } from "@/server/db";
import * as schema from "@/server/db/schemas/users";
import { sendEmail } from "@/server/email";

const getBaseUrl = () => {
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;

  return `http://localhost:${env.PORT}`;
};

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  plugins: [
    nextCookies(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendEmail({
          html: `
            <div style="text-align: center; font-family: sans-serif;">
              <h1>Welcome to notras</h1>
              <p>Click below to sign in:</p>
              <a href="${url}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: black; color: white; text-decoration: none; border-radius: 8px;">Sign in</a>
              <p style="margin-top: 24px; font-size: 12px; color: gray;">If you didn’t request this, you can ignore it.</p>
            </div>
          `,
          subject: "Your notras magic link ✨",
          to: email,
        });
      },
    }),
  ],
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      redirectURI: `${getBaseUrl()}/api/auth/callback/github`,
    },
  },
});

export const getSession = cache(async () => {
  return await auth.api.getSession({
    headers: await headers(),
  });
});
