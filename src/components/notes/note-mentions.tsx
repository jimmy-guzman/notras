import { FileTextIcon } from "lucide-react";

import { NoteLabel } from "@/components/notes/note-label";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { contextFrom } from "@/core/links";
import type { Mention } from "@/core/links";

interface MentionItemProps {
  mention: Mention;
  onOpen: (path: string, beside: boolean) => void;
}

export function MentionItem({ mention, onOpen }: MentionItemProps) {
  const { lines, note } = mention;
  const [first] = lines;

  return (
    <DropdownMenuItem
      className="items-start"
      onClick={(event) => {
        onOpen(note.path, event.metaKey);
      }}
    >
      <FileTextIcon className="mt-0.5" />
      <div className="flex min-w-0 flex-col">
        <NoteLabel note={note}>
          {/* The pill counts notes, so a note linked twice says so here. */}
          {lines.length === 1 ? null : (
            <span className="text-muted-foreground text-xs tabular-nums">
              +{lines.length - 1}
            </span>
          )}
        </NoteLabel>
        <span className="text-muted-foreground truncate text-xs">
          {contextFrom(first)}
        </span>
      </div>
    </DropdownMenuItem>
  );
}
