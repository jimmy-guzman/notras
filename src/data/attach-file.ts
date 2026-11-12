import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** Copy a dragged-in file into attachments, returning its relative path. */
export async function attachFile(sourcePath: string): Promise<string> {
  return await nativeCommand(async () => await commands.attachFile(sourcePath));
}

/** Save a pasted image, returning its relative path. */
export async function attachImage(base64Data: string): Promise<string> {
  return await nativeCommand(
    async () => await commands.attachImage(base64Data)
  );
}
