import type { Theme } from "@/server/adapters/bindings";
import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

export async function getTheme(): Promise<Theme> {
  return await nativeCommand(async () => await commands.getTheme());
}

export async function setTheme(theme: Theme): Promise<void> {
  await nativeCommand(async () => await commands.setTheme(theme));
}
