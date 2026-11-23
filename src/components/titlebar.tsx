import { cn } from "cn";
import type { ComponentProps } from "react";

/**
 * A window drag region: the bar above the note, and the band above the
 * browser.
 *
 * The 32px height pairs with the traffic light offset in both
 * `tauri.conf.json` and `src-tauri/src/lib.rs`, which centres macOS's window
 * buttons in it; changing this height means rechecking both. The buttons float
 * over the top left, so `ps-titlebar` starts the content after them.
 *
 * A 1px line runs under the bar. It is drawn before the bar's children, so the
 * active tab, which reaches the bar's bottom edge, covers its own stretch of
 * it and joins the note.
 *
 * The region is `deep`: a press anywhere in the band moves the window unless
 * it lands on a control. Tauri's handler treats a button, an input, or a `tab`
 * role as that boundary, so a control opts out by being one.
 */
export function Titlebar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-shell text-muted-foreground ps-titlebar before:bg-border relative flex h-8 shrink-0 items-center gap-1 py-1 pe-1 text-xs before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:h-px",
        className
      )}
      data-tauri-drag-region="deep"
      {...props}
    />
  );
}
