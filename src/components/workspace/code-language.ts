import { syntaxLanguage } from "@/components/editor/syntax-highlighter";
import {
  bareDestination,
  isCsvPath,
  isNotePath,
  isRelativeDestination,
} from "@/core/links";

/** Extensions shown without highlighting, which no lexer would open as code. */
const BY_EXTENSION = new Map([
  ["lock", "text"],
  ["txt", "text"],
]);

/** Pictures a lexer could read, which a link opens as the picture in the system app. */
const PICTURES = new Set(["svg"]);

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

  const name = bareDestination(destination).split("/").at(-1) ?? "";

  return PICTURES.has(name.slice(name.lastIndexOf(".") + 1).toLowerCase())
    ? undefined
    : codeFileLanguage(name);
}
