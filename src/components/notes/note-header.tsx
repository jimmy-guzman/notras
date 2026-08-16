import { useNavigate } from "@tanstack/react-router";
import { PinIcon, PinOffIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { noteTitle } from "@/core";
import { setNotePinned } from "@/data/pin-note";
import { renameNote } from "@/data/rename-note";
import { cn } from "@/lib/ui/utils";

interface NoteHeaderProps {
  path: string;
  pinned: boolean;
}

export function NoteHeader({ path, pinned }: NoteHeaderProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(() => {
    return noteTitle(path);
  });
  const [optimisticPinned, setOptimisticPinned] = useState(pinned);

  // Optimistic state follows the loader (adjust-during-render pattern): a pin
  // from the palette, or an agent editing the frontmatter on disk, must show
  // up here instead of being stuck on whatever we last set ourselves.
  const [syncedPinned, setSyncedPinned] = useState(pinned);

  if (syncedPinned !== pinned) {
    setSyncedPinned(pinned);
    setOptimisticPinned(pinned);
  }

  const commitTitle = async () => {
    const trimmed = title.trim();

    if (trimmed === "" || trimmed === noteTitle(path)) {
      setTitle(noteTitle(path));

      return;
    }

    try {
      const nextPath = await renameNote(path, trimmed);

      await navigate({
        params: { _splat: nextPath },
        replace: true,
        to: "/notes/$",
      });
    } catch (error) {
      setTitle(noteTitle(path));
      toast.error(error instanceof Error ? error.message : "rename failed");
    }
  };

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
      <input
        aria-label="note title"
        className="min-w-0 flex-1 truncate rounded-sm bg-transparent text-sm font-medium outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onBlur={commitTitle}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }

          if (event.key === "Escape") {
            setTitle(noteTitle(path));
            event.currentTarget.blur();
          }
        }}
        placeholder="untitled"
        spellCheck={false}
        value={title}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={optimisticPinned ? "unpin note" : "pin note"}
              aria-pressed={optimisticPinned}
              className={cn("size-6", optimisticPinned && "text-primary")}
              onClick={togglePinned}
              size="icon"
              variant="ghost"
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
