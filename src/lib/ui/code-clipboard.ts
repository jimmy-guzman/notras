import { hasMessage } from "@/core/errors";
import { commands } from "@/server/adapters/bindings";
import type { CodeClipboard } from "@/server/adapters/bindings";

export type { CodeClipboard } from "@/server/adapters/bindings";

export type ReadCodeClipboard = (text: string) => Promise<CodeClipboard | null>;

/** Read native code metadata for the text belonging to this paste event. */
export async function readCodeClipboard(
  text: string
): Promise<CodeClipboard | null> {
  try {
    return await commands.readCodeClipboard(text);
  } catch (error) {
    if (hasMessage(error)) {
      throw new Error(error.message, { cause: error });
    }
    throw error;
  }
}
