import { syntaxLanguage } from "@/components/editor/syntax-highlighter";
import {
  bareDestination,
  isCsvPath,
  isNotePath,
  isRelativeDestination,
} from "@/core/links";

/**
 * Extensions shiki names differently or not at all. No grammar has the id
 * `text`, so a file sent there is shown without highlighting.
 */
const BY_EXTENSION = new Map([
  ["env", "text"],
  ["h", "c"],
  ["hpp", "cpp"],
  ["lock", "text"],
  ["mk", "makefile"],
  ["patch", "diff"],
  ["txt", "text"],
]);

/** The language a file name's extension names, or undefined for one nothing here names. */
export function codeFileLanguage(name: string): string | undefined {
  const dot = name.lastIndexOf(".");

  if (dot === -1) {
    return undefined;
  }

  const extension = name.slice(dot + 1).toLowerCase();

  return BY_EXTENSION.get(extension) ?? syntaxLanguage(extension);
}

/**
 * The language a relative destination opens as a code tab with, or undefined
 * for a note, a csv, or a file nothing here names, which the system app opens.
 */
export function codeLanguage(destination: string): string | undefined {
  if (
    !isRelativeDestination(destination) ||
    isNotePath(destination) ||
    isCsvPath(destination)
  ) {
    return undefined;
  }

  return codeFileLanguage(bareDestination(destination).split("/").at(-1) ?? "");
}
