import "./globals.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { Nav } from "@/components/nav";
import { getUserByUserId } from "@/lib/get-user-by-user-id";
import { auth } from "@/server/auth";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Next.js Starter",
  description: "Another opinionated Next.js Starter.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await auth();

  const user = session?.user?.id
    ? await getUserByUserId(session.user.id)
    : null;

  return (
    <html lang="en" data-theme={user?.theme}>
      <body className={inter.className}>
        <div className="max-w-[100vw] px-6 pb-16 xl:pr-2">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
