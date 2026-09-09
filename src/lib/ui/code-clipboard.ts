import { invoke } from "@tauri-apps/api/core";

export interface CodeClipboard {
  language: string | null;
}

export type ReadCodeClipboard = (text: string) => Promise<CodeClipboard | null>;

/** Read native code metadata for the text belonging to this paste event. */
export async function readCodeClipboard(
  text: string
): Promise<CodeClipboard | null> {
  try {
    return await invoke<CodeClipboard | null>("read_code_clipboard", { text });
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
