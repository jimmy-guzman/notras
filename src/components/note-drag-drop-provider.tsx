"use client";

import type { ReactNode } from "react";

import { AutoScroller, defaultPreset } from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";

const plugins = defaultPreset.plugins.filter((p) => p !== AutoScroller);

export function NoteDragDropProvider({ children }: { children: ReactNode }) {
  return <DragDropProvider plugins={plugins}>{children}</DragDropProvider>;
}
