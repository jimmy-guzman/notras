import { array, check, pipe, string } from "valibot";

import { readStored, writeStored } from "@/lib/storage";

const STORAGE_KEY = "recent-actions";

const HistorySchema = pipe(
  array(string()),
  check((values) => new Set(values).size === values.length)
);

export function writeRecentActions(values: string[]) {
  writeStored(STORAGE_KEY, values, "could not remember command");
}

/** The palette action values picked before, most recent first. */
export function readRecentActions(): string[] {
  return (
    readStored(STORAGE_KEY, HistorySchema, "could not read recent commands") ??
    []
  );
}
