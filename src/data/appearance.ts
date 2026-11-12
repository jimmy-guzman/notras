import type { Appearance } from "@/server/adapters/bindings";
import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

export async function getAppearance(): Promise<Appearance> {
  return await nativeCommand(async () => await commands.getAppearance());
}

export async function setAppearance(appearance: Appearance): Promise<void> {
  await nativeCommand(async () => await commands.setAppearance(appearance));
}
