import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DM_Sans, Geist, Geist_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { AlphaBanner } from "@/components/alpha-banner";
import { HotkeysProvider } from "@/components/hotkeys-provider";
import { ReminderChecker } from "@/components/reminder-checker";
import { SearchBarProvider } from "@/components/search-bar-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata = {
  description: "A minimal, personal notes app. Just write, otra vez.",
  title: "notras",
} satisfies Metadata;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html className={dmSans.variable} lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NuqsAdapter>
          <TooltipProvider>
            <HotkeysProvider>
              <SearchBarProvider>
                <AlphaBanner />
                <div className="flex min-h-svh flex-col">
                  <header className="sticky inset-x-0 top-0 isolate z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background">
                    <SiteNav />
                  </header>
                  <main className="flex flex-1 justify-center">{children}</main>
                  <SiteFooter />
                </div>
                <Toaster />
                <ReminderChecker />
              </SearchBarProvider>
            </HotkeysProvider>
          </TooltipProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
