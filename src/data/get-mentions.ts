import { nativeCommand } from "@/data/native-command";
import { mentionResult } from "@/data/note-results";
import { commands } from "@/server/adapters/bindings";

export async function getMentions(path: string) {
  const mentions = await nativeCommand(() => commands.findMentions(path));
  return mentions
    .map(mentionResult)
    .toSorted((left, right) => left.note.path.localeCompare(right.note.path));
}
