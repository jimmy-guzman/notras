import type { ReactNode } from "react";

interface TitlebarProps {
  children?: ReactNode;
}

/**
 * The window drag region, and the only chrome above the note.
 *
 * The bottom hairline is an inset shadow rather than a border because the
 * active tab has to paint over it, and a child cannot paint over an ancestor's
 * border (`D52`).
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
      className="titlebar-drag-region flex h-9 shrink-0 items-center bg-card ps-titlebar pe-3 shadow-[inset_0_-1px_0_var(--border)]"
      data-tauri-drag-region
    >
      {children}
    </div>
  );
}
