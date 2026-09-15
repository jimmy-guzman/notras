import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";
import type { PendingOpen } from "@/server/adapters/bindings";

/** The tab a markdown link in an external document opens: a note inside the notes dir, an external file otherwise. */
export async function resolveExternalLink(
  document: string,
  destination: string
): Promise<PendingOpen> {
  return await nativeCommand(() =>
    commands.resolveExternalLink(document, destination)
  );
}
