import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import HolyLoader from "holy-loader";
import { Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { AlphaBanner } from "@/components/alpha-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  description:
    "A soft space for fleeting thoughts. Capture your daydreams as they drift by.",
  title: "notras",
} satisfies Metadata;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <HolyLoader color="#ccc" />
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <NuqsAdapter>
            <TooltipProvider>
              <AlphaBanner />
              <div className="flex min-h-svh flex-col">
                <header className="bg-background sticky inset-x-0 top-0 isolate z-20 flex h-14 shrink-0 items-center gap-2 border-b">
                  <SiteNav />
                </header>
                <main className="flex flex-1 justify-center">{children}</main>
                <SiteFooter />
              </div>
              <Toaster />
            </TooltipProvider>
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
