import { array, check, pipe, string } from "valibot";

import type { NoteMeta } from "@/core/notes";
import { readStored, writeStored } from "@/lib/storage";

const HistorySchema = pipe(
  array(string()),
  check((paths) => new Set(paths).size === paths.length)
);

function storageKey(notesDir: string) {
  return `recent-notes:${notesDir}`;
}

function writeHistory(notesDir: string, paths: string[]) {
  writeStored(storageKey(notesDir), paths, "could not update recent notes");
}

export function readRecentNotes(notesDir: string): string[] {
  return (
    readStored(
      storageKey(notesDir),
      HistorySchema,
      "could not read recent notes"
    ) ?? []
  );
}

function orderByVisit(notesDir: string, notes: NoteMeta[]) {
  const history = readRecentNotes(notesDir);
  const positions = new Map(history.map((path, index) => [path, index]));
  return notes.toSorted(
    (a, b) =>
      (positions.get(a.path) ?? history.length) -
        (positions.get(b.path) ?? history.length) ||
      b.updatedAt.getTime() - a.updatedAt.getTime() ||
      (a.path < b.path ? -1 : Number(a.path > b.path))
  );
}

export function recentNotes(notesDir: string, notes: NoteMeta[]): NoteMeta[] {
  return orderByVisit(notesDir, notes).toSorted(
    (a, b) => Number(b.pinned) - Number(a.pinned)
  );
}

export function lastChosenNote(
  notesDir: string,
  notes: NoteMeta[]
): NoteMeta | undefined {
  return orderByVisit(notesDir, notes)[0];
}

export function rememberNote(notesDir: string, path: string): void {
  writeHistory(notesDir, [
    path,
    ...readRecentNotes(notesDir).filter((entry) => entry !== path),
  ]);
}

export function forgetNote(notesDir: string, path: string): void {
  writeHistory(
    notesDir,
    readRecentNotes(notesDir).filter((entry) => entry !== path)
  );
}

export function renameRecentNote(
  notesDir: string,
  from: string,
  to: string
): void {
  const history = readRecentNotes(notesDir);
  if (from !== to && history.includes(from)) {
    writeHistory(
      notesDir,
      history.flatMap((path) =>
        path === to ? [] : [path === from ? to : path]
      )
    );
  }
}
