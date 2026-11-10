import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** Open a code file in the app the system picks for it. */
export async function openCode(path: string): Promise<void> {
  await nativeCommand(async () => await commands.openCode(path));
}
