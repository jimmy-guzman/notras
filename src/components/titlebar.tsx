import type { ReactNode } from "react";

interface TitlebarProps {
  children?: ReactNode;
}

/**
 * The window drag region, and the only chrome above the note.
 *
 * The bottom hairline is an inset shadow rather than a border, so the band
 * offers its full height to what it holds.
 *
 * The 36px height pairs with the traffic light offset `D29` carries, in both
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
      className="bg-card ps-titlebar flex h-9 shrink-0 items-center pe-3 shadow-[inset_0_-1px_0_var(--border)]"
      data-tauri-drag-region="deep"
    >
      {children}
    </div>
  );
}
