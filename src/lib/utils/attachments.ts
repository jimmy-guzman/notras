import { decode, encode } from "mdurl";

const IMAGE_EXTENSION = /\.(?:gif|jpe?g|png|svg|webp)$/i;

/**
 * A path becomes a destination percent-encoded, the separators apart, since a
 * bare one ends at the first space (`D57`).
 */
export function encodeAttachmentPath(relativePath: string) {
  return encode(relativePath, `/${encode.componentChars}`);
}

/** The inverse: `convertFileSrc` encodes again, so a `src` reaches it decoded. */
export function decodeAttachmentPath(src: string) {
  return decode(src, decode.componentChars);
}

/**
 * A label ends at its first `]`, so brackets going inside one are escaped. A
 * backslash is not: the parser hands back `\\` from a label unchanged, so
 * escaping one would double it on every save.
 */
export function escapeMarkdownLabel(text: string) {
  return text.replaceAll(/[[\]]/g, "\\$&");
}

/** A title ends at its quote, and unlike a label it does unescape `\\`. */
export function escapeMarkdownTitle(text: string) {
  return text.replaceAll(/["\\]/g, "\\$&");
}

/** The markdown a dropped file inserts: an embed for an image, a link otherwise. */
export function attachmentLink(relativePath: string) {
  const name = relativePath.split("/").at(-1) ?? relativePath;
  const label = escapeMarkdownLabel(name);
  const destination = encodeAttachmentPath(relativePath);

  return IMAGE_EXTENSION.test(relativePath)
    ? `![${label}](${destination})`
    : `[${label}](${destination})`;
}
