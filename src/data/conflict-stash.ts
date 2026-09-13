import { nativeCommand } from "@/data/native-command";
import type { Tab } from "@/lib/tabs/tab";
import { commands } from "@/server/adapters/bindings";

/** The version an unsaved review started from, and the unsaved text itself. */
export interface ConflictStash {
  base: { content: string; revision: string; updatedAt: Date };
  ours: string;
}

/** The stored review for a tab, or null when it has none. */
export async function readConflictStash(
  kind: Tab["kind"],
  path: string
): Promise<ConflictStash | null> {
  const stash = await nativeCommand(() => commands.readConflict(kind, path));

  return stash === null
    ? null
    : {
        base: { ...stash.base, updatedAt: new Date(stash.base.updatedAt) },
        ours: stash.ours,
      };
}

/** Store a review so it survives closing the tab and the app. */
export async function stashConflict(
  kind: Tab["kind"],
  path: string,
  stash: ConflictStash
): Promise<void> {
  await nativeCommand(() =>
    commands.stashConflict(kind, path, {
      base: { ...stash.base, updatedAt: stash.base.updatedAt.getTime() },
      ours: stash.ours,
    })
  );
}

/** Remove a tab's stored review; a missing one is not a failure. */
export async function clearConflictStash(
  kind: Tab["kind"],
  path: string
): Promise<void> {
  await nativeCommand(() => commands.clearConflict(kind, path));
}
