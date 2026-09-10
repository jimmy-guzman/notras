import type { Picture } from "@/core/graph";
import { nativeCommand } from "@/data/native-command";
import { mentionResult, noteResult } from "@/data/note-results";
import {
  commands,
  type GraphTarget,
  type Picture as NativePicture,
} from "@/server/adapters/bindings";

function pictureResult(picture: NativePicture): Picture {
  if (picture.kind === "hub") {
    const hubs = picture.members.filter((member) => member.kind === "hub");
    const notes = picture.members
      .filter((member) => member.kind === "note")
      .map((member) => ({ ...member, note: noteResult(member.note) }))
      .toSorted((left, right) => left.note.path.localeCompare(right.note.path));
    return { ...picture, members: [...hubs, ...notes] };
  }
  return {
    ...picture.graph,
    incoming: picture.graph.incoming
      .map(mentionResult)
      .toSorted((left, right) => left.note.path.localeCompare(right.note.path)),
    kind: "note",
    note: noteResult(picture.note),
    outgoing: picture.graph.outgoing.map(mentionResult),
  };
}

export async function getGraph(target: GraphTarget) {
  const result = await nativeCommand(() => commands.readGraph(target));
  return {
    mentionsError: result.mentionsError,
    picture:
      result.picture === null ? undefined : pictureResult(result.picture),
  };
}
