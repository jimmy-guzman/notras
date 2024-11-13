import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

import { db } from "@/server/db";

const protectedRoutes = new Set(["/settings/profile", "/settings/theme"]);

export const {
  auth,
  handlers: { GET, POST },
  signIn,
  signOut,
} = NextAuth({
  adapter: DrizzleAdapter(db),
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      return protectedRoutes.has(pathname) ? !!auth : true;
    },
  },
  pages: {
    signIn: "/signin",
  },
  providers: [GitHub],
});
