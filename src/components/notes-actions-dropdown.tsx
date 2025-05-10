import { MoreVertical } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import type { Kind } from "@/lib/kind";

import { archiveNote } from "@/actions/archive-note";
import { pinNote } from "@/actions/pin-note";
import { unarchiveNote } from "@/actions/unarchive-note";
import { unpinNote } from "@/actions/unpin-note";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { LinkedNotesListContent } from "./link-notes";
import { Button } from "./ui/button";

interface Note {
  content: string;
  createdAt: Date;
  id: string;
  kind: Kind | null;
  metadata: null | {
    aiKindInferred?: boolean;
  };
  pinnedAt: Date | null;
}

interface NoteActionsDropdownProps {
  isEditing: boolean;
  note: Note;
  onEditToggle: () => void;
}

export function NoteActionsDropdown({
  isEditing,
  note,
  onEditToggle,
}: NoteActionsDropdownProps) {
  const pinned = useMemo(() => {
    return Boolean(note.pinnedAt);
  }, [note.pinnedAt]);

  async function handleTogglePin() {
    await (pinned ? unpinNote(note.id) : pinNote(note.id));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEditToggle}>
          {isEditing ? "Cancel Edit" : "Edit"}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => {
            return navigator.clipboard.writeText(note.content);
          }}
        >
          Copy
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handleTogglePin}>
          {note.pinnedAt ? "Unpin" : "Pin"}
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Links</DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-72">
              <LinkedNotesListContent noteId={note.id} />
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={async () => {
            await archiveNote(note.id);

            toast("Note archived", {
              action: {
                label: "Undo",
                onClick: () => {
                  void (async () => {
                    await unarchiveNote(note.id);
                  })();
                },
              },
            });
          }}
        >
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
