import type { ReactNode } from "react";

interface TitlebarProps {
  children?: ReactNode;
}

/**
 * The window drag region, and the only chrome above the note.
 *
 * The 36px height pairs with the traffic light offset `D29` carries, in both
 * `tauri.conf.json` and `src-tauri/src/lib.rs`, which centres macOS's window
 * buttons in it; changing this height means rechecking both. The buttons float
 * over the top left, so `ps-titlebar` starts the content after them, and
 * buttons and inputs opt out of dragging through `styles.css`.
 */
export function Titlebar({ children }: TitlebarProps) {
  return (
    <div
      className="titlebar-drag-region flex h-9 shrink-0 items-center border-b ps-titlebar pe-3"
      data-tauri-drag-region
    >
      {children}
    </div>
  );
}
