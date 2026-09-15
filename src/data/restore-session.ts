import { queryOptions } from "@tanstack/react-query";
import { adoptVaultNotes, getTabState, restoreTabs } from "@/lib/tabs/store";
import { commands } from "@/server/adapters/bindings";

/**
 * Reopen last session's tabs. A restored path that no longer reads closes its
 * own tab, so nothing is checked against disk here. Resolves to the tab state
 * at launch when nothing was saved, which is how the workspace tells whether
 * anything has been opened since, and to null when the saved tabs came back.
 */
async function restoreSession() {
  const restored = restoreTabs();

  if (restored) {
    await adoptVaultNotes(commands.classifyOpenPaths);
  }

  return restored ? null : getTabState();
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
