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
import { cn } from "@/lib/ui/utils";

const STATUS: Record<
  SaveStatus,
  { icon: typeof SaveIcon; label: string; tone: string }
> = {
  dirty: { icon: SavePenIcon, label: "unsaved", tone: "" },
  failed: {
    icon: SaveOffIcon,
    label: "could not save",
    tone: "text-destructive",
  },
  saved: { icon: SaveCheckIcon, label: "saved", tone: "text-faint" },
  saving: { icon: SaveIcon, label: "saving", tone: "" },
};

interface SaveIndicatorProps {
  status: SaveStatus;
}

/**
 * The note's save state as a glyph (`D35`). Not a control: the tooltip is
 * hover-only and the word lives in the accessibility tree.
 */
export function SaveIndicator({ status }: SaveIndicatorProps) {
  const { icon: Icon, label, tone } = STATUS[status];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center",
              tone,
            )}
          />
        }
      >
        <Icon className="size-3.5" />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
