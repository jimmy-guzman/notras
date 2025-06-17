import { Sparkles } from "lucide-react";

import type { Kind } from "@/lib/kind";

import { KIND_LABELS } from "@/lib/kind";

import { Badge } from "./ui/badge";
import { Card, CardContent, CardFooter } from "./ui/card";

interface Note {
  content: string;
  createdAt: string;
  id: string;
  kind: Kind | null;
  metadata: null | {
    aiKindInferred?: boolean;
  };
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);

  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const NoteCardSkeleton = () => {
  return (
    <Card className="flex h-40 animate-pulse flex-col">
      <CardContent className="flex-1 p-4">
        <div className="bg-muted mb-2 h-4 rounded" />
        <div className="bg-muted mb-2 h-4 w-4/5 rounded" />
        <div className="bg-muted h-4 w-3/4 rounded" />
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t px-4 pt-2 pb-4">
        <div className="bg-muted h-3 w-16 rounded" />
        <div className="bg-muted h-5 w-12 rounded-full" />
      </CardFooter>
    </Card>
  );
};

export const NoteCard = ({
  handleClick,
  note,
}: {
  handleClick: (id: string) => void;
  note: Note;
}) => {
  return (
    <Card
      className="group focus-visible:ring-ring flex h-40 cursor-pointer flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:outline-none"
      key={note.id}
      onClick={() => {
        handleClick(note.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick(note.id);
        }
      }}
      tabIndex={0}
    >
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
  );
};
