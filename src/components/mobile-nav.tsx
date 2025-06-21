"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { Button } from "./ui/button";

export function MobileNav({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="md:hidden">
      <Sheet onOpenChange={setIsOpen} open={isOpen}>
        <SheetTrigger asChild>
          <Button size="icon" variant="ghost">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-64" side="left">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-left">
              <span className="text-xl">🌸</span>
              Menu
            </SheetTitle>
          </SheetHeader>
          <nav className="mt-6 space-y-2">
            <Link
              className="hover:bg-accent block rounded-md px-3 py-2 text-sm font-medium"
              href="/"
              onClick={() => {
                setIsOpen(false);
              }}
            >
              Home
            </Link>
            {isAuthenticated && (
              <>
                <Link
                  className="hover:bg-accent block rounded-md px-3 py-2 text-sm font-medium"
                  href="/notes"
                  onClick={() => {
                    setIsOpen(false);
                  }}
                >
                  Browse
                </Link>
                <Link
                  className="hover:bg-accent block rounded-md px-3 py-2 text-sm font-medium"
                  href="/archives"
                  onClick={() => {
                    setIsOpen(false);
                  }}
                >
                  Archives
                </Link>
              </>
            )}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
