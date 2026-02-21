import Link from "next/link";

import type { SelectNote } from "@/server/db/schemas/notes";

import { Card, CardContent, CardFooter } from "../ui/card";
import { PinNoteButton } from "./pin-note-button";

const formatDate = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const NoteCard = ({ note }: { note: SelectNote }) => {
  return (
    <Link
      className="group focus-visible:ring-ring block focus-visible:ring-2 focus-visible:outline-none"
      href={`/notes/${note.id}`}
    >
      <Card className="relative flex cursor-pointer flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <PinNoteButton
          className="absolute top-2 right-2 z-10"
          noteId={note.id}
          pinned={Boolean(note.pinnedAt)}
        />
        <CardContent className="flex-1 py-4">
          <p className="text-foreground group-hover:text-foreground/90 truncate text-sm leading-relaxed transition-colors">
            {note.content}
          </p>
        </CardContent>
        <CardFooter className="border-t">
          <span className="text-muted-foreground group-hover:text-muted-foreground/80 text-xs transition-colors">
            {formatDate(note.createdAt)}
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
};
