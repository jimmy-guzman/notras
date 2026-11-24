import { useSyncExternalStore } from "react";
import { number, record, string } from "valibot";

import type { NoteMeta } from "@/core/notes";

import { lastSaved } from "./note-history";
import { readStored, writeStored } from "./storage";

const StoredVisitsSchema = record(string(), number());

function storageKey(notesDir: string) {
  return `recent-notes:${notesDir}`;
}

/** Each visited path with the time of its last visit. */
function readStoredVisits(notesDir: string) {
  return (
    readStored(
      storageKey(notesDir),
      StoredVisitsSchema,
      "could not read recent notes"
    ) ?? {}
  );
}

const visitListeners = new Set<() => void>();

let lastRead:
  | { content: string; notesDir: string; visits: Map<string, number> }
  | undefined;

function writeStoredVisits(notesDir: string, visits: Record<string, number>) {
  writeStored(storageKey(notesDir), visits, "could not update recent notes");

  for (const notify of visitListeners) {
    notify();
  }
}

/**
 * The visits with each stamp earlier than the next newer one and than `now`.
 * Two visits inside one tick of the clock keep their order, and a stamp from a
 * clock that ran ahead cannot stay above a visit made after it.
 */
function stampedBefore(now: number, visits: Record<string, number>) {
  const earlier: Record<string, number> = {};
  let limit = now;

  for (const [path, at] of Object.entries(visits).toSorted(
    ([, a], [, b]) => b - a
  )) {
    limit = Math.min(at, limit - 1);
    earlier[path] = limit;
  }

  return earlier;
}

function subscribeToVisits(onVisit: () => void) {
  visitListeners.add(onVisit);

  return () => {
    visitListeners.delete(onVisit);
  };
}

/** Each visited path with the time of its last visit, last visited first. The same map comes back until the stored visits change, which is what lets a component subscribe to it. */
export function readVisits(notesDir: string): Map<string, number> {
  const stored = readStoredVisits(notesDir);
  const content = JSON.stringify(stored);

  if (lastRead?.notesDir !== notesDir || lastRead.content !== content) {
    lastRead = {
      content,
      notesDir,
      visits: new Map(Object.entries(stored).toSorted(([, a], [, b]) => b - a)),
    };
  }

  return lastRead.visits;
}

/** The visits, read again whenever the stored visits change. */
export function useVisits(notesDir: string): Map<string, number> {
  return useSyncExternalStore(subscribeToVisits, () => readVisits(notesDir));
}

/** The notes opened here or saved anywhere, the latest first. */
export function recentNotes(
  notes: NoteMeta[],
  visits: Map<string, number>
): NoteMeta[] {
  const lastActive = (note: NoteMeta) =>
    Math.max(visits.get(note.path) ?? 0, lastSaved(note));

  return notes.toSorted(
    (a, b) =>
      lastActive(b) - lastActive(a) ||
      (a.path < b.path ? -1 : Number(a.path > b.path))
  );
}

export function rememberNote(notesDir: string, path: string): void {
  const now = Date.now();

  writeStoredVisits(notesDir, {
    ...stampedBefore(now, readStoredVisits(notesDir)),
    [path]: now,
  });
}

export function forgetNote(notesDir: string, path: string): void {
  writeStoredVisits(
    notesDir,
    Object.fromEntries(
      Object.entries(readStoredVisits(notesDir)).filter(
        ([entry]) => entry !== path
      )
    )
  );
}

export function renameRecentNote(
  notesDir: string,
  from: string,
  to: string
): void {
  const visits = readStoredVisits(notesDir);

  if (from !== to && from in visits) {
    writeStoredVisits(
      notesDir,
      Object.fromEntries(
        Object.entries(visits).flatMap(([path, at]) =>
          path === to ? [] : [[path === from ? to : path, at]]
        )
      )
    );
  }
}
