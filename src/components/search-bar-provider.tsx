"use client";

import type { ReactNode } from "react";

import { LayoutGroup } from "motion/react";

export function SearchBarProvider({ children }: { children: ReactNode }) {
  return <LayoutGroup>{children}</LayoutGroup>;
}
