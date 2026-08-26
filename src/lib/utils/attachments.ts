import { decode, encode } from "mdurl";

const IMAGE_EXTENSION = /\.(?:gif|jpe?g|png|svg|webp)$/i;

/**
 * A markdown destination is a URL, so a path reaches one percent-encoded. The
 * bare form ends at the first space -- which every macOS screenshot name has --
 * and a destination the parser rejects stays on screen as text.
 *
 * The exclude set is `encodeURIComponent`'s unreserved characters plus the `/`
 * that joins the segments, so the path stays readable. Encoding rather than
 * renaming the file on copy keeps the name someone sees in Finder, and a note
 * already carrying an encoded path needs the decode side either way.
 */
export function encodeAttachmentPath(relativePath: string) {
  return encode(relativePath, `/${encode.componentChars}`);
}

/**
 * The inverse, for handing a doc `src` back to the filesystem. Tauri's
 * `convertFileSrc` encodes the whole path again, so an encoded `src` reaching
 * it asks for a file whose name holds a literal `%20`. `decode.componentChars`
 * is empty, so nothing is left escaped, and a stray `%` someone typed by hand
 * is read as itself rather than failing the segment around it.
 */
export function decodeAttachmentPath(src: string) {
  return decode(src, decode.componentChars);
}

/** The markdown a dropped file inserts: an embed for an image, a link for the rest. */
export function attachmentLink(relativePath: string) {
  const name = relativePath.split("/").at(-1) ?? relativePath;
  const destination = encodeAttachmentPath(relativePath);

  return IMAGE_EXTENSION.test(relativePath)
    ? `![${name}](${destination})`
    : `[${name}](${destination})`;
}
