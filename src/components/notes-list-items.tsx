"use client";

import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

import type { Kind } from "@/lib/kind";

import { KIND_LABELS } from "@/lib/kind";
import { groupNotesByKind } from "@/lib/utils/group-notes-by-kind";
import { groupNotesByTime } from "@/lib/utils/group-notes-by-time";

import { ArchiveNote } from "./archive-note";
import { CopyNote } from "./copy-note";
import { NoteContent } from "./note-content";
import { PinNote } from "./pin-note";
import { Badge } from "./ui/badge";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const containerVariants = {
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  exit: { opacity: 0, scale: 0.95 },
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1 },
};

interface Note {
  content: string;
  createdAt: Date;
  id: string;
  kind: Kind | null;
  pinnedAt: Date | null;
}

interface NotesListItemsProps {
  filteredNotes: Note[];
  query?: string;
}

export function NotesListItems({ filteredNotes, query }: NotesListItemsProps) {
  const [groupByKind, setGroupByKind] = useState(false);

  const groupedNotes = useMemo(() => {
    return groupByKind
      ? groupNotesByKind(filteredNotes)
      : groupNotesByTime(filteredNotes);
  }, [filteredNotes, groupByKind]);

  return (
    <motion.div
      animate="show"
      className="mx-auto flex w-full max-w-2xl flex-col gap-8"
      initial="hidden"
      variants={containerVariants}
    >
      <ToggleGroup
        aria-label="Group notes"
        className="mt-2 self-center sm:self-end"
        onValueChange={(value) => {
          setGroupByKind(value === "kind");
        }}
        size="sm"
        type="single"
        value={groupByKind ? "kind" : "time"}
      >
        <ToggleGroupItem value="time">Group by time</ToggleGroupItem>
        <ToggleGroupItem value="kind">Explore by kind</ToggleGroupItem>
      </ToggleGroup>

      {groupedNotes.map(({ label, notes }) => {
        return (
          <div className="flex flex-col gap-6" key={label}>
            <h2 className="text-muted-foreground text-sm font-medium">
              {label}
            </h2>

            <AnimatePresence>
              {notes.map((note) => {
                return (
                  <motion.div
                    animate="show"
                    className="flex flex-col gap-2"
                    exit="exit"
                    initial="hidden"
                    key={note.id}
                    transition={{ duration: 0.2 }}
                    variants={itemVariants}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground flex items-center gap-2 text-sm opacity-70">
                        <span>{format(note.createdAt, "PPP pp")}</span>
                        {note.kind ? (
                          <Badge
                            className="text-xs capitalize"
                            variant="outline"
                          >
                            {KIND_LABELS[note.kind]}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 opacity-60 transition-opacity hover:opacity-100">
                        <PinNote
                          noteId={note.id}
                          pinned={Boolean(note.pinnedAt)}
                        />
                        <CopyNote content={note.content} />
                        <ArchiveNote noteId={note.id} />
                      </div>
                    </div>
                    <NoteContent content={note.content} query={query} />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        );
      })}
    </motion.div>
  );
}
