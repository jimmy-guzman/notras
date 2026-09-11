import { cn } from "cn";
import { PinIcon, PinOffIcon } from "lucide-react";
import { useCallback } from "react";
import type { SaveStatus } from "@/components/editor/use-autosave";
import { SaveIndicator } from "@/components/notes/save-indicator";
import { toast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { changeNoteMetadata } from "@/lib/tabs/store";
import { CHROME_GLYPH } from "@/lib/ui/chrome";
import { reasonOf } from "@/lib/ui/failure";

interface PinToggleProps {
  path: string;
  pinned: boolean;
}

function PinToggle({ path, pinned }: PinToggleProps) {
  const togglePinned = useCallback(async () => {
    try {
      await changeNoteMetadata(path, { pinned: !pinned });
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not update pin",
        type: "error",
      });
    }
  }, [pinned, path]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            aria-label={pinned ? "unpin note" : "pin note"}
            className="aria-pressed:bg-transparent aria-pressed:text-foreground"
            onPressedChange={togglePinned}
            pressed={pinned}
            size="icon-xs"
          />
        }
      >
        {pinned ? (
          <PinIcon className={CHROME_GLYPH} />
        ) : (
          <PinOffIcon className={cn(CHROME_GLYPH, "opacity-60")} />
        )}
      </TooltipTrigger>
      <TooltipContent>{pinned ? "unpin" : "pin"}</TooltipContent>
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
