import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";

/** Copy a dragged-in file into attachments, returning its relative path. */
export async function attachFile(sourcePath: string): Promise<string> {
  return await nativeCommand(() => commands.attachFile(sourcePath));
}

/** Save a pasted image, returning its relative path. */
export async function attachImage(base64Data: string): Promise<string> {
  return await nativeCommand(() => commands.attachImage(base64Data));
}
