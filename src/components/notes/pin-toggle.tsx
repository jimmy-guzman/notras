import { PinIcon, PinOffIcon } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { changeNoteMetadata, useTabSnapshot } from "@/lib/tabs/store";
import type { Tab } from "@/lib/tabs/tab";
import { CHROME_GLYPH } from "@/lib/ui/chrome";
import { reasonOf } from "@/lib/ui/failure";

interface PinToggleProps {
  tab: Tab;
}

/**
 * Subscribes to the snapshot itself: read one level up, a keystroke would
 * re-render the workspace and every mounted session with it.
 */
export function PinToggle({ tab }: PinToggleProps) {
  const pinned = useTabSnapshot(tab.id)?.pinned ?? false;
  const Icon = pinned ? PinIcon : PinOffIcon;
  const togglePinned = async () => {
    try {
      await changeNoteMetadata(tab.path, { pinned: !pinned });
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
