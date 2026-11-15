import type { Picture } from "@/core/graph";
import { commands } from "@/server/adapters/bindings";
import type {
  GraphTarget,
  Picture_Serialize as NativePicture,
} from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";
import { mentionResult } from "./note-results";

function pictureResult(picture: NativePicture): Picture {
  if (picture.kind === "hub") {
    const hubs = picture.members.filter((member) => member.kind === "hub");

    const notes = picture.members
      .filter((member) => member.kind === "note")
      .toSorted((left, right) => left.note.path.localeCompare(right.note.path));

    return { ...picture, members: [...hubs, ...notes] };
  }

  return {
    ...picture.graph,
    incoming: picture.graph.incoming
      .map(mentionResult)
      .toSorted((left, right) => left.note.path.localeCompare(right.note.path)),
    kind: "note",
    note: picture.note,
    outgoing: picture.graph.outgoing.map(mentionResult),
  };
}

export async function getGraph(target: GraphTarget) {
  const result = await nativeCommand(
    async () => await commands.readGraph(target)
  );

  return {
    mentionsError: result.mentionsError,
    picture:
      result.picture === null ? undefined : pictureResult(result.picture),
  };
}
