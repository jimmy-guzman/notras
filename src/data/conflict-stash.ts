import { commands } from "@/server/adapters/bindings";
import type { OpenKind } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** The version an unsaved review started from, and the unsaved text itself. */
export interface ConflictStash {
  base: { content: string; revision: string; updatedAt: Date };
  ours: string;
}

/** The stored review for a tab, or null when it has none. */
export async function readConflictStash(
  kind: OpenKind,
  path: string
): Promise<ConflictStash | null> {
  return await nativeCommand(
    async () => await commands.readConflict(kind, path)
  );
}

/** Store a review so it survives closing the tab and the app. */
export async function stashConflict(
  kind: OpenKind,
  path: string,
  stash: ConflictStash
): Promise<void> {
  await nativeCommand(
    async () => await commands.stashConflict(kind, path, stash)
  );
}

/** Remove a tab's stored review; a missing one is not a failure. */
export async function clearConflictStash(
  kind: OpenKind,
  path: string
): Promise<void> {
  await nativeCommand(async () => await commands.clearConflict(kind, path));
}
