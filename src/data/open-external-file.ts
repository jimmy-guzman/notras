import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** Open a file an external document links to in the app the system picks, resolved against that document. */
export async function openExternalFile(
  document: string,
  destination: string
): Promise<void> {
  await nativeCommand(
    async () => await commands.openExternalFile(document, destination)
  );
}
