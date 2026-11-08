import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** Refuse a path that names no csv file, with the host's reason. */
export async function checkCsv(path: string): Promise<void> {
  await nativeCommand(async () => await commands.checkCsv(path));
}
