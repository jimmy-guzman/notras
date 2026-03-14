"use client";

import "./globals.css";

import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { DM_Sans, Geist, Geist_Mono } from "next/font/google";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

interface GlobalErrorProps {
  reset: () => void;
}

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html className={dmSans.variable} lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen items-center justify-center bg-background p-4 antialiased`}
      >
        <div className="w-full max-w-md">
          <Alert variant="destructive">
            <TriangleAlertIcon className="h-4 w-4" />
            <AlertTitle>something went wrong</AlertTitle>
            <AlertDescription>
              we couldn&apos;t load the app. please try again.
            </AlertDescription>
          </Alert>

          <div className="mt-4 flex justify-center">
            <Button onClick={reset} size="sm" variant="outline">
              <RotateCcwIcon className="h-4 w-4" />
              try again
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
