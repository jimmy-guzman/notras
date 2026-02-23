"use client";

import type { ReactNode } from "react";

import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";

interface HotkeysProviderProps {
  children: ReactNode;
}

export function HotkeysProvider({ children }: HotkeysProviderProps) {
  const router = useRouter();

  useHotkeys("a", () => {
    router.push("/notes");
  });

  useHotkeys("n", () => {
    router.push("/notes/new");
  });

  useHotkeys("h", () => {
    router.push("/");
  });

  return <>{children}</>;
}
