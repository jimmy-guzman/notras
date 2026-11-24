import type { NoteMeta } from "@/core/notes";

function dayOf(at: number, now: Date) {
  const startOfDay = (daysAgo: number) =>
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - daysAgo
    ).getTime();

  if (at >= startOfDay(0)) {
    return "today";
  }

  if (at >= startOfDay(1)) {
    return "yesterday";
  }

  return at >= startOfDay(7) ? "previous 7 days" : "older";
}

export type HistoryDay = ReturnType<typeof dayOf>;

/** When the file was last created or saved, by anyone. */
export function lastSaved(note: NoteMeta): number {
  return Math.max(note.createdAt.getTime(), note.updatedAt.getTime());
}

/** The notes under the day each was last saved as of `now`, the latest first. A time ahead of `now` counts as today. */
export function notesByDay(
  notes: NoteMeta[],
  now: number
): Map<HistoryDay, NoteMeta[]> {
  const today = new Date(now);

  return Map.groupBy(
    notes.toSorted((a, b) => lastSaved(b) - lastSaved(a)),
    (note) => dayOf(lastSaved(note), today)
  );
}
