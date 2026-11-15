import type { Mention } from "@/core/links";
import type { Mention_Serialize as NativeMention } from "@/server/adapters/bindings";

export function mentionResult(mention: NativeMention): Mention {
  const [first, ...rest] = mention.lines;

  if (first === undefined) {
    throw new Error("A mention has no source line");
  }

  return { lines: [first, ...rest], note: mention.note };
}
