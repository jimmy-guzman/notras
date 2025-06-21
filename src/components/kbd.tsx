import type { ReactNode } from "react";

import { cn } from "@/lib/ui/utils";

interface KbdProps {
  children: ReactNode;
  className?: string;
}

export const Kbd = ({ children, className }: KbdProps) => {
  return (
    <kbd
      className={cn(
        "flex h-5 items-center justify-center gap-1 rounded border border-current/20 bg-current/10 px-1 font-mono text-xs leading-[normal] font-medium text-current/70 select-none",
        className,
      )}
    >
      {children}
    </kbd>
  );
};
