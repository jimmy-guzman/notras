import { queryOptions } from "@tanstack/react-query";

import { reclassifyTabs, restoreTabs } from "@/lib/tabs/store";
import { commands } from "@/server/adapters/bindings";

import { getNotesDir } from "./notes-dir";

/**
 * Reopen last session's tabs. A restored path that no longer reads closes its
 * own tab, so nothing is checked against disk here.
 */
async function restoreSession() {
  if (restoreTabs()) {
    await reclassifyTabs(
      async (paths) => await commands.classifyOpenPaths(paths),
      await getNotesDir()
    );
  }

  return null;
}

/**
 * Runs once per launch: `static` keeps the result out of reach of every
 * invalidation, and an infinite `gcTime` keeps it while the error screen has
 * no observer on it. A rejected run is what the error screen's retry refetches.
 */
export const startupQuery = queryOptions({
  gcTime: Number.POSITIVE_INFINITY,
  queryFn: restoreSession,
  queryKey: ["startup"],
  staleTime: "static",
});
