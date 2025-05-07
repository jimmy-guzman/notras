"use client";

import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";

import type { Kind } from "@/lib/kind";

import { KIND_LABELS } from "@/lib/kind";
import { groupNotesByTime } from "@/lib/utils/group-notes-by-time";

import { ArchiveNote } from "./archive-note";
import { CopyNote } from "./copy-note";
import { NoteContent } from "./note-content";
import { PinNote } from "./pin-note";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

const noteVariants = {
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.15, ease: "easeInOut" },
    y: 5,
  },
  hidden: { opacity: 0, scale: 0.98, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { damping: 20, stiffness: 120, type: "spring" },
    y: 0,
  },
};

interface Note {
  content: string;
  createdAt: Date;
  id: string;
  kind: Kind | null;
  pinnedAt: Date | null;
}

interface NotesListProps {
  notes: Note[];
  query?: string;
}

export function NotesList({ notes, query }: NotesListProps) {
  const groupedNotes = useMemo(() => {
    return groupNotesByTime(notes);
  }, [notes]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-12">
      <AnimatePresence mode="popLayout">
        {groupedNotes.map(({ label, notes }, index) => {
          const isLast = index === groupedNotes.length - 1;

          return (
            <motion.div
              animate={{ height: "auto", opacity: 1 }}
              className="flex flex-col gap-6 overflow-hidden"
              exit={{ height: 0, opacity: 0 }}
              initial={{ height: 0, opacity: 0 }}
              key={label}
              layout
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              {label && (
                <motion.h2
                  animate={{ opacity: 1, y: 0 }}
                  className="text-muted-foreground text-sm font-medium"
                  initial={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                  {label}
                </motion.h2>
              )}
              <AnimatePresence mode="popLayout">
                {notes.map((note) => {
                  return (
                    <motion.div
                      animate="visible"
                      exit="exit"
                      initial="hidden"
                      key={note.id}
                      layout
                      variants={noteVariants}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-muted-foreground flex items-center gap-2 text-sm opacity-70">
                          <span>{format(note.createdAt, "PPP pp")}</span>
                          {note.kind && (
                            <Badge
                              className="text-xs capitalize"
                              variant="outline"
                            >
                              {KIND_LABELS[note.kind]}
                            </Badge>
                          )}
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
                {!isLast && (
                  <motion.div
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    key={`separator-${label}`}
                    layout
                    transition={{ duration: 0.2 }}
                  >
                    <Separator />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
