import { commands } from "@/server/adapters/bindings";
import type { LinkTarget } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** Where a link in an external document leads, classified as Open With classifies its target: a tab, or the system app. */
export async function resolveExternalLink(
  document: string,
  destination: string
): Promise<LinkTarget> {
  return await nativeCommand(
    async () => await commands.resolveExternalLink(document, destination)
  );
}
