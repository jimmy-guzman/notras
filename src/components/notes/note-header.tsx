import { PinIcon, PinOffIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { SaveStatus } from "@/components/editor/use-autosave";

import { SaveIndicator } from "@/components/notes/save-indicator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { setNotePinned } from "@/data/pin-note";

interface NoteHeaderProps {
  path: string;
  pinned: boolean;
  status: SaveStatus;
  /** Resolved by `D32`'s chain, so it is display-only: renaming is a palette action. */
  title: string;
}

export function NoteHeader({ path, pinned, status, title }: NoteHeaderProps) {
  const [optimisticPinned, setOptimisticPinned] = useState(pinned);

  // Optimistic state follows the loader (adjust-during-render pattern): a pin
  // from the palette, or an agent editing the frontmatter on disk, must show
  // up here instead of being stuck on whatever we last set ourselves.
  const [syncedPinned, setSyncedPinned] = useState(pinned);

  if (syncedPinned !== pinned) {
    setSyncedPinned(pinned);
    setOptimisticPinned(pinned);
  }

  const togglePinned = async () => {
    setOptimisticPinned(!optimisticPinned);

    try {
      await setNotePinned(path, !optimisticPinned);
    } catch {
      setOptimisticPinned(optimisticPinned);
      toast.error("could not update pin");
    }
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="min-w-0 flex-1 truncate font-medium text-sm">
        {title}
      </span>
      <SaveIndicator status={status} />
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              aria-label={optimisticPinned ? "unpin note" : "pin note"}
              className="aria-pressed:bg-transparent aria-pressed:text-foreground"
              onPressedChange={togglePinned}
              pressed={optimisticPinned}
              size="icon-xs"
            />
          }
        >
          {optimisticPinned ? (
            <PinIcon className="size-4" />
          ) : (
            <PinOffIcon className="size-4 opacity-60" />
          )}
        </TooltipTrigger>
        <TooltipContent>{optimisticPinned ? "unpin" : "pin"}</TooltipContent>
      </Tooltip>
    </div>
  );
}
