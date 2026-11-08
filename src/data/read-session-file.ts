import type { OpenKind } from "@/server/adapters/bindings";

import { readExternalNote } from "./external-note";
import { getNote } from "./get-note";

/** One tab's file content, revision and timestamp as of a read. */
export interface SessionFile {
  content: string;
  revision: string;
  updatedAt: Date;
}

/** The file a tab edits, read from the library or from the host path. */
export async function readSessionFile(
  kind: OpenKind,
  path: string
): Promise<SessionFile> {
  if (kind === "csv") {
    throw new Error("A csv has no editing session");
  }

  return kind === "external"
    ? await readExternalNote(path)
    : await getNote(path);
}
