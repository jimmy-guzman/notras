import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** Open a file a note links to in the app the system picks, resolved against that note. */
export async function openLinkedFile(
  from: string,
  destination: string
): Promise<void> {
  await nativeCommand(
    async () => await commands.openLinkedFile(from, destination)
  );
}
