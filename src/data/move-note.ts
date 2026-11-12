import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

export async function moveNote(path: string, folder: string) {
  const receipt = await nativeCommand(
    async () => await commands.moveNote(path, folder)
  );

  return {
    ...receipt,
    file: { ...receipt.file, updatedAt: new Date(receipt.file.updatedAt) },
  };
}
