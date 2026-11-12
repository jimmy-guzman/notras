import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";
import { mentionResult } from "./note-results";

export async function getMentions(path: string) {
  const mentions = await nativeCommand(
    async () => await commands.findMentions(path)
  );

  return mentions
    .map(mentionResult)
    .toSorted((left, right) => left.note.path.localeCompare(right.note.path));
}
