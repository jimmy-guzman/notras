"use client";

import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";

import { groupAndSortNotes } from "@/lib/utils/group-notes";

import { ArchiveNote } from "./archive-note";
import { CopyNote } from "./copy-note";
import { NoteContent } from "./note-content";
import { PinNote } from "./pin-note";

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
  pinnedAt: Date | null;
}

interface NotesListItemsProps {
  filteredNotes: Note[];
  query?: string;
}

export function NotesListItems({ filteredNotes, query }: NotesListItemsProps) {
  const groupedNotes = useMemo(() => {
    return groupAndSortNotes(filteredNotes);
  }, [filteredNotes]);

  return (
    <motion.div
      animate="show"
      className="mx-auto flex w-full max-w-2xl flex-col gap-8"
      initial="hidden"
      variants={containerVariants}
    >
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
                      <div className="text-muted-foreground text-sm opacity-70">
                        {format(note.createdAt, "PPP pp")}
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
