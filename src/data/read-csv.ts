import { commands } from "@/server/adapters/bindings";
import type { CsvFile } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/**
 * Read a csv file at an absolute path through once: its header, row count,
 * column probe and page starts. Answers null when it still stands at `known`.
 */
export async function readCsvIfMoved(
  path: string,
  known: string | null
): Promise<CsvFile | null> {
  return await nativeCommand(
    async () => await commands.readCsvIfMoved(path, known)
  );
}

/** Read one page of body rows from the byte `readCsvIfMoved` reported for it, at the revision it reported. */
export async function readCsvRows(
  path: string,
  revision: string,
  start: number
): Promise<string[][]> {
  return await nativeCommand(
    async () => await commands.readCsvRows(path, revision, start)
  );
}
