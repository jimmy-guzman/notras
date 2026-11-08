import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** Open a csv file in the app the system picks for it. */
export async function openCsv(path: string): Promise<void> {
  await nativeCommand(async () => await commands.openCsv(path));
}
