import { decode, encode } from "mdurl";

import { noteFolder } from "@/core/notes";

const IMAGE_EXTENSION = /\.(?:gif|jpe?g|png|svg|webp)$/u;

/** Lowered first: an `i` flag would fold a long s into `svg`, which Rust refuses. */
export function isImageName(name: string) {
  return IMAGE_EXTENSION.test(name.toLowerCase());
}

/** Undoes `attachmentDestination`'s encoding: `convertFileSrc` encodes again, so a `src` reaches it decoded. */
export function decodeAttachmentPath(src: string) {
  return decode(src, decode.componentChars);
}

/**
 * A label ends at its first unescaped bracket. marked's matcher eats every
 * `\\X` as a pair while its unescaper undoes brackets alone, so the run of
 * backslashes before one has to be even for the escape to survive the match,
 * and escaping the backslashes themselves would double them on every save.
 *
 * An odd run therefore gains one, and its alt reads one backslash long: the
 * grammar cannot hold a lone backslash before a bracket, and an image that
 * renders beats a line that does not parse.
 */
export function escapeMarkdownLabel(text: string) {
  return text.replaceAll(
    /(?<run>\\*)(?<bracket>[[\]])/gu,
    (_match, run: string, bracket: string) =>
      `${run.length % 2 === 0 ? run : `${run}\\`}\\${bracket}`
  );
}

/** A title ends at its quote, and unlike a label it does unescape `\\`. */
export function escapeMarkdownTitle(text: string) {
  return text.replaceAll(/["\\]/gu, "\\$&");
}

function parensBalance(path: string) {
  let depth = 0;

  for (const char of path) {
    depth += Number(char === "(") - Number(char === ")");

    if (depth < 0) {
      return false;
    }
  }

  return depth === 0;
}

/**
 * A library path as the note at `from` writes it: one `..` per folder the
 * note sits in, since a destination resolves against the note. Encoded with
 * only the separators and unreserved marks left bare, since a space ends a bare
 * destination, and with no escape kept, since the path is a name on disk and a
 * `%` in it is a percent sign. Parens stay readable unless they would not
 * balance, which is the one case that breaks a bare destination.
 */
export function attachmentDestination(relativePath: string, from: string) {
  const climb = noteFolder(from)
    .split("/")
    .filter((segment) => segment !== "")
    .map(() => "..");

  const path = [...climb, relativePath].join("/");

  return encode(path, parensBalance(path) ? "/-_.!~*'()" : "/-_.!~*'", false);
}

/** The markdown a dropped file inserts into the note at `from`: an embed for an image, a link otherwise. */
export function attachmentLink(relativePath: string, from: string) {
  const name = relativePath.split("/").at(-1) ?? relativePath;
  const label = escapeMarkdownLabel(name);
  const destination = attachmentDestination(relativePath, from);

  return isImageName(relativePath)
    ? `![${label}](${destination})`
    : `[${label}](${destination})`;
}
