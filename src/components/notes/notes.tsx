"use client";

import { motion } from "motion/react";

import type { SelectNote } from "@/server/db/schemas/notes";
import type { SelectTag } from "@/server/db/schemas/tags";

import { NoteListItem } from "./note-list-item";

const STAGGER_DELAY = 0.05;

interface NotesListProps {
  currentParams?: { folder?: string; q?: string; tag?: string; time?: string };
  notes: SelectNote[];
  query?: string;
  tagMap?: Record<string, SelectTag[]>;
}

export const NotesList = ({
  currentParams,
  notes,
  query,
  tagMap,
}: NotesListProps) => {
  return (
    <div className="flex flex-col divide-y">
      {notes.map((note, index) => {
        return (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 20 }}
            key={note.id}
            layout
            transition={{
              damping: 30,
              delay: index * STAGGER_DELAY,
              stiffness: 300,
              type: "spring",
            }}
          >
            <NoteListItem
              currentParams={currentParams}
              note={note}
              query={query}
              tags={tagMap?.[note.id] ?? []}
            />
          </motion.div>
        );
      })}
    </div>
  );
};
