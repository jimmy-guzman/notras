import type { Kind } from "@/lib/kind";

import { KIND_LABELS, KIND_VALUES } from "@/lib/kind";

interface Note {
  content: string;
  createdAt: Date;
  id: string;
  kind: Kind | null;
  pinnedAt: Date | null;
}

export interface GroupedNote {
  group: Kind;
  label: string;
  notes: Note[];
}

export function groupNotesByKind(notes: Note[]): GroupedNote[] {
  const groups = Object.fromEntries(
    KIND_VALUES.map((kind) => {
      return [kind, []] as [Kind, Note[]];
    }),
  ) as Record<Kind, Note[]>;

  for (const note of notes) {
    const kind = note.kind ?? "thought";

    groups[kind].push(note);
  }

  return KIND_VALUES.map((kind) => {
    return {
      group: kind,
      label: KIND_LABELS[kind],
      notes: groups[kind].sort((a, b) => {
        const aPinned = a.pinnedAt ? -1 : 0;
        const bPinned = b.pinnedAt ? -1 : 0;

        return (
          aPinned - bPinned || b.createdAt.getTime() - a.createdAt.getTime()
        );
      }),
    };
  }).filter((group) => {
    return group.notes.length > 0;
  });
}
