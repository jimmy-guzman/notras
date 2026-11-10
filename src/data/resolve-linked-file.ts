import { commands } from "@/server/adapters/bindings";
import type { LinkTarget } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** Where a csv or code link leads by the host path it folds to: a tab, or the system app. */
export async function resolveLinkedFile(path: string): Promise<LinkTarget> {
  return await nativeCommand(
    async () => await commands.resolveLinkedFile(path)
  );
}
