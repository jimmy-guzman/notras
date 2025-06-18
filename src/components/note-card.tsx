import { Sparkles } from "lucide-react";
import Link from "next/link";

import type { Kind } from "@/lib/kind";

import { KIND_LABELS } from "@/lib/kind";

import { Badge } from "./ui/badge";
import { Card, CardContent, CardFooter } from "./ui/card";

interface Note {
  content: string;
  createdAt: Date;
  id: string;
  kind: Kind | null;
  metadata: null | {
    aiKindInferred?: boolean;
  };
}

const formatDate = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const NoteCard = ({ note }: { note: Note }) => {
  return (
    <Link
      className="group focus-visible:ring-ring block focus-visible:ring-2 focus-visible:outline-none"
      href={`/notes/${note.id}`}
    >
      <Card className="flex h-40 cursor-pointer flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <CardContent className="flex-1 p-4">
          <p className="text-foreground group-hover:text-foreground/90 truncate text-sm leading-relaxed transition-colors">
            {note.content}
          </p>
        </CardContent>
        <CardFooter className="flex items-center justify-between border-t px-4 pt-2 pb-4">
          <span className="text-muted-foreground group-hover:text-muted-foreground/80 text-xs transition-colors">
            {formatDate(note.createdAt)}
          </span>
          <Badge
            className="text-xs transition-all group-hover:scale-105"
            variant="outline"
          >
            {KIND_LABELS[note.kind ?? "thought"]}
            {note.metadata?.aiKindInferred && (
              <Sparkles className="ml-1 h-2 w-2" />
            )}
          </Badge>
        </CardFooter>
      </Card>
    </Link>
  );
};
