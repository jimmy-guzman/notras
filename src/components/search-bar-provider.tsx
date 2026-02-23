"use client";

import type { ReactNode } from "react";

import { LayoutGroup, MotionConfig } from "motion/react";

export function SearchBarProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>{children}</LayoutGroup>
    </MotionConfig>
  );
}
