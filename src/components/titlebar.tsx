import type { ReactNode } from "react";

interface TitlebarProps {
  children?: ReactNode;
}

/**
 * The window drag region, and the only chrome above the note.
 *
 * The 44px height pairs with `TRAFFIC_LIGHTS` in `src-tauri/src/lib.rs`, which
 * centres macOS's window buttons in it, so ordinary centring puts everything on
 * one line (`D29`). Both values come from erictli/scratch; changing this height
 * means rechecking that offset. The buttons float over the top left, so
 * `ps-titlebar` starts the content after them, and buttons and inputs opt out of
 * dragging through `styles.css`.
 */
export function Titlebar({ children }: TitlebarProps) {
  return (
    <div
      className="titlebar-drag-region flex h-11 shrink-0 items-center border-b ps-titlebar pe-3"
      data-tauri-drag-region
    >
      {children}
    </div>
  );
}
