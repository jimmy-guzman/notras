import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";

/** Open a file a note links to in the app the system picks, resolved against that note. */
export async function openLinkedFile(
  from: string,
  destination: string
): Promise<void> {
  await nativeCommand(() => commands.openLinkedFile(from, destination));
}
