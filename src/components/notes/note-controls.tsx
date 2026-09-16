import { PinIcon, PinOffIcon } from "lucide-react";

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
import { CHROME_GLYPH, CHROME_TOGGLE } from "@/lib/ui/chrome";
import { reasonOf } from "@/lib/ui/failure";

interface PinToggleProps {
  path: string;
  pinned: boolean;
}

function PinToggle({ path, pinned }: PinToggleProps) {
  const Icon = pinned ? PinIcon : PinOffIcon;
  const togglePinned = async () => {
    try {
      await changeNoteMetadata(path, { pinned: !pinned });
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not update pin",
        type: "error",
      });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            aria-label={pinned ? "unpin note" : "pin note"}
            className={CHROME_TOGGLE}
            onPressedChange={() => {
              void togglePinned();
            }}
            pressed={pinned}
            size="icon-xs"
          />
        }
      >
        <Icon className={CHROME_GLYPH} />
      </TooltipTrigger>
      <TooltipContent>{pinned ? "unpin note" : "pin note"}</TooltipContent>
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
    <div className="flex shrink-0 items-center gap-1">
      <SaveIndicator reason={reason} status={status} />
      {note === undefined ? null : (
        <PinToggle path={note.path} pinned={note.pinned} />
      )}
    </div>
  );
}
