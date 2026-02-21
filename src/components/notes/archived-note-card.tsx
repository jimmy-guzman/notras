import type { SelectNote } from "@/server/db/schemas/notes";

import { Card, CardContent, CardFooter } from "../ui/card";
import { RestoreNoteButton } from "./restore-note-button";

const formatDate = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const ArchivedNoteCard = ({ note }: { note: SelectNote }) => {
  return (
    <Card className="relative flex flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <RestoreNoteButton
        className="absolute top-2 right-2 z-10"
        noteId={note.id}
      />
      <CardContent className="flex-1 py-4">
        <p className="text-foreground group-hover:text-foreground/90 truncate text-sm leading-relaxed transition-colors">
          {note.content}
        </p>
      </CardContent>
      <CardFooter className="border-t">
        {note.deletedAt && (
          <span className="text-muted-foreground group-hover:text-muted-foreground/80 text-xs transition-colors">
            {formatDate(note.deletedAt)}
          </span>
        )}
      </CardFooter>
    </Card>
  );
};
