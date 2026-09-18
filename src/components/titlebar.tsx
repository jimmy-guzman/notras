import type { ReactNode } from "react";

interface TitlebarProps {
  children?: ReactNode;
}

/**
 * The window drag region, and the only chrome above the note.
 *
 * The 32px height pairs with the traffic light offset in both
 * `tauri.conf.json` and `src-tauri/src/lib.rs`, which centres macOS's window
 * buttons in it; changing this height means rechecking both. The buttons float
 * over the top left, so `ps-titlebar` starts the content after them.
 *
 * The region is `deep`: a press anywhere in the band moves the window unless
 * it lands on a control. Tauri's handler treats a button, an input, or a `tab`
 * role as that boundary, so a control opts out by being one.
 */
export function Titlebar({ children }: TitlebarProps) {
  return (
    <div
      className="bg-shell text-muted-foreground ps-titlebar flex h-8 shrink-0 items-center gap-1 py-1 pe-1"
      data-tauri-drag-region="deep"
    >
      {children}
    </div>
  );
}
