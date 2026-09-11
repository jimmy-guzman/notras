import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";

export async function moveNote(path: string, folder: string) {
  const receipt = await nativeCommand(() => commands.moveNote(path, folder));
  return {
    ...receipt,
    file: { ...receipt.file, updatedAt: new Date(receipt.file.updatedAt) },
  };
}
