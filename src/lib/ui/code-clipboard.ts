import { type CodeClipboard, commands } from "@/server/adapters/bindings";

export type { CodeClipboard } from "@/server/adapters/bindings";

export type ReadCodeClipboard = (text: string) => Promise<CodeClipboard | null>;

/** Read native code metadata for the text belonging to this paste event. */
export async function readCodeClipboard(
  text: string
): Promise<CodeClipboard | null> {
  try {
    return await commands.readCodeClipboard(text);
  } catch (error) {
    if (
      typeof error === "object" &&
      // biome-ignore lint/suspicious/noUnnecessaryConditions: a native rejection is unknown, and typeof null is "object".
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      throw new Error(error.message, { cause: error });
    }
    throw error;
  }
}
