import { cn } from "cn";
import { PinIcon, PinOffIcon } from "lucide-react";
import { useCallback, useState } from "react";
import type { SaveStatus } from "@/components/editor/use-autosave";
import { SaveIndicator } from "@/components/notes/save-indicator";
import { toast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { setNotePinned } from "@/data/pin-note";
import { CHROME_GLYPH } from "@/lib/ui/chrome";
import { reasonOf } from "@/lib/ui/failure";

interface PinToggleProps {
  path: string;
  pinned: boolean;
}

function PinToggle({ path, pinned }: PinToggleProps) {
  const [optimisticPinned, setOptimisticPinned] = useState(pinned);

  // Optimistic state follows the file (adjust-during-render pattern): a pin
  // from the palette, or an agent editing the frontmatter on disk, must show
  // up here instead of being stuck on whatever we last set ourselves.
  const [syncedPinned, setSyncedPinned] = useState(pinned);

  if (syncedPinned !== pinned) {
    setSyncedPinned(pinned);
    setOptimisticPinned(pinned);
  }

  const togglePinned = useCallback(async () => {
    setOptimisticPinned(!optimisticPinned);

    try {
      await setNotePinned(path, !optimisticPinned);
    } catch (error) {
      setOptimisticPinned(optimisticPinned);
      toast.add({
        description: reasonOf(error),
        title: "could not update pin",
        type: "error",
      });
    }
  }, [optimisticPinned, path]);

  return (
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
          <PinIcon className={CHROME_GLYPH} />
        ) : (
          <PinOffIcon className={cn(CHROME_GLYPH, "opacity-60")} />
        )}
      </TooltipTrigger>
      <TooltipContent>{optimisticPinned ? "unpin" : "pin"}</TooltipContent>
    </Tooltip>
  );
}

interface NoteControlsProps {
  /** Absent for an external file, which carries no frontmatter to pin. */
  note?: { path: string; pinned: boolean };
  reason: string | undefined;
  status: SaveStatus;
}

/**
 * What the title bar holds beside the tabs: the active tab's save state and
 * its pin.
 *
 * The note's identity moved to its tab when `D52` put the strip here, so this
 * no longer carries the title.
 */
export function NoteControls({ note, reason, status }: NoteControlsProps) {
  return (
    <div className="flex shrink-0 items-center gap-3 ps-3">
      <SaveIndicator reason={reason} status={status} />
      {note === undefined ? null : (
        <PinToggle path={note.path} pinned={note.pinned} />
      )}
    </div>
  );
}
