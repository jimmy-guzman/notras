import { isThisWeek, isToday } from "date-fns";

import type { Kind } from "../kind";

export type TimeGroup = "earlier" | "thisWeek" | "today";

interface Note {
  content: string;
  createdAt: Date;
  id: string;
  kind: Kind | null;
  pinnedAt: Date | null;
}

const timeGroupMeta = {
  earlier: { label: "Earlier", order: 2 },
  thisWeek: { label: "This Week", order: 1 },
  today: { label: "Today", order: 0 },
};

export function groupNotesByTime(notes: Note[]) {
  const groups: Record<TimeGroup, Note[]> = {
    earlier: [],
    thisWeek: [],
    today: [],
  };

  for (const note of notes) {
    if (isToday(note.createdAt)) {
      groups.today.push(note);
    } else if (isThisWeek(note.createdAt, { weekStartsOn: 1 })) {
      groups.thisWeek.push(note);
    } else {
      groups.earlier.push(note);
    }
  }

  return (Object.keys(groups) as TimeGroup[])
    .filter((key) => {
      return groups[key].length > 0;
    })
    .sort((a, b) => {
      return timeGroupMeta[a].order - timeGroupMeta[b].order;
    })
    .map((key) => {
      const sortedNotes = [...groups[key]].sort((a, b) => {
        if (a.pinnedAt && !b.pinnedAt) return -1;
        if (!a.pinnedAt && b.pinnedAt) return 1;

        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      return {
        group: key,
        label: timeGroupMeta[key].label,
        notes: sortedNotes,
      };
    });
}
