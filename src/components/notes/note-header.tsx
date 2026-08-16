import { useNavigate } from "@tanstack/react-router";
import { PinIcon, PinOffIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { noteTitle } from "@/core";
import { setNotePinned } from "@/data/pin-note";
import { renameNote } from "@/data/rename-note";
import { setNoteTags } from "@/data/set-note-tags";
import { cn } from "@/lib/ui/utils";

interface TagEditorProps {
  onTagsChange: (tags: string[]) => void;
  tags: string[];
}

function TagEditor({ onTagsChange, tags }: TagEditorProps) {
  const [draft, setDraft] = useState("");

  const commitDraft = () => {
    const tag = draft.trim().toLowerCase();

    setDraft("");
    if (tag !== "" && !tags.includes(tag)) {
      onTagsChange([...tags, tag]);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {tags.map((tag) => {
        return (
          <Badge className="gap-1 font-normal" key={tag} variant="secondary">
            {tag}
            <button
              aria-label={`remove tag ${tag}`}
              className="opacity-60 transition-opacity hover:opacity-100"
              onClick={() => {
                onTagsChange(
                  tags.filter((existing) => {
                    return existing !== tag;
                  }),
                );
              }}
              type="button"
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        );
      })}
      <input
        aria-label="add tag"
        className="w-16 rounded-sm bg-transparent text-xs text-muted-foreground outline-none placeholder:text-faint focus-visible:ring-[2px] focus-visible:ring-ring/50"
        onBlur={commitDraft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commitDraft();
          }

          if (event.key === "Backspace" && draft === "" && tags.length > 0) {
            onTagsChange(tags.slice(0, -1));
          }
        }}
        placeholder="+ tag"
        value={draft}
      />
    </div>
  );
}

interface NoteHeaderProps {
  path: string;
  pinned: boolean;
  tags: string[];
}

export function NoteHeader({ path, pinned, tags }: NoteHeaderProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(() => {
    return noteTitle(path);
  });
  const [optimisticPinned, setOptimisticPinned] = useState(pinned);
  const [optimisticTags, setOptimisticTags] = useState(tags);

  // Optimistic state follows the loader (adjust-during-render pattern): a pin
  // from the palette, or an agent editing the frontmatter on disk, must show
  // up here instead of being stuck on whatever we last set ourselves. Tags are
  // compared by value -- the loader hands back a fresh array every refresh.
  const tagsKey = tags.join("\n");
  const [syncedPinned, setSyncedPinned] = useState(pinned);
  const [syncedTags, setSyncedTags] = useState(tagsKey);

  if (syncedPinned !== pinned) {
    setSyncedPinned(pinned);
    setOptimisticPinned(pinned);
  }

  if (syncedTags !== tagsKey) {
    setSyncedTags(tagsKey);
    setOptimisticTags(tags);
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

  const changeTags = async (nextTags: string[]) => {
    const previous = optimisticTags;

    setOptimisticTags(nextTags);

    try {
      await setNoteTags(path, nextTags);
    } catch {
      setOptimisticTags(previous);
      toast.error("could not update tags");
    }
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <input
        aria-label="note title"
        className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium outline-none placeholder:text-faint"
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
      <TagEditor onTagsChange={changeTags} tags={optimisticTags} />
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
