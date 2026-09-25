import { hasMessage } from "@/core/errors";
import { commands } from "@/server/adapters/bindings";
import type { ClipboardSource } from "@/server/adapters/bindings";

export type { ClipboardSource } from "@/server/adapters/bindings";

export type ReadClipboardSource = (
  text: string
) => Promise<ClipboardSource | null>;

/** Read where the text belonging to this paste event was copied from. */
export async function readClipboardSource(
  text: string
): Promise<ClipboardSource | null> {
  try {
    return await commands.readClipboardSource(text);
  } catch (error) {
    if (hasMessage(error)) {
      throw new Error(error.message, { cause: error });
    }
    throw error;
  }
}
