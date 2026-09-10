import type { Mention } from "@/core/links";
import type { NoteMeta } from "@/core/notes";
import type {
  Mention as NativeMention,
  NoteMeta as NativeNote,
} from "@/server/adapters/bindings";

export function noteResult(note: NativeNote): NoteMeta {
  return {
    ...note,
    createdAt: new Date(note.createdAt),
    updatedAt: new Date(note.updatedAt),
  };
}

export function mentionResult(mention: NativeMention): Mention {
  const [first, ...rest] = mention.lines;
  if (first === undefined) {
    throw new Error("a mention has no source line");
  }
  return { lines: [first, ...rest], note: noteResult(mention.note) };
}
