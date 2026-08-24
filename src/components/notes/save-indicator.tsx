import {
  SaveCheckIcon,
  SaveIcon,
  SaveOffIcon,
  SavePenIcon,
} from "lucide-react";

import type { SaveStatus } from "@/components/editor/use-autosave";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CHROME_GLYPH } from "@/lib/ui/chrome";
import { cn } from "@/lib/ui/utils";

const STATUS: Record<
  SaveStatus,
  { icon: typeof SaveIcon; label: string; tone?: string }
> = {
  dirty: { icon: SavePenIcon, label: "unsaved" },
  failed: {
    icon: SaveOffIcon,
    label: "could not save",
    tone: "text-destructive",
  },
  saved: { icon: SaveCheckIcon, label: "saved", tone: "opacity-60" },
  saving: { icon: SaveIcon, label: "saving" },
};

interface SaveIndicatorProps {
  status: SaveStatus;
}

/**
 * The note's save state as a glyph (`D35`). Not a control: the tooltip is
 * hover-only and the word lives in the accessibility tree.
 *
 * `no-drag` is load-bearing since `D38` put this in the titlebar: the drag
 * region exempts only `button`, `input` and `.no-drag`, and a `span` without it
 * never receives the hover that opens the tooltip.
 */
export function SaveIndicator({ status }: SaveIndicatorProps) {
  const { icon: Icon, label, tone } = STATUS[status];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "no-drag inline-flex size-6 shrink-0 items-center justify-center",
              tone
            )}
          />
        }
      >
        <Icon className={CHROME_GLYPH} />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
