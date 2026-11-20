import { imageTag } from "@/components/editor/image-tag";
import { parseNote } from "@/core/frontmatter";
import { isImageName, linkResolver, resolveImage } from "@/core/links";
import type { NoteMeta } from "@/core/notes";
import { wikilinkParts } from "@/core/notes";
import { attachmentDestination, attachmentLink } from "@/lib/utils/attachments";
import type { ImageList } from "@/server/adapters/bindings";

import { getNote } from "./get-note";

// Obsidian's `|400` or `|400x300`. The height goes, since a width alone keeps
// the ratio. Six digits at most: a long enough number prints as `1e+21`, which
// no `<img>` width reads back.
const IMAGE_SIZE = /^(?<width>[1-9]\d{0,5})(?:x\d+)?$/u;

/** The image at `path` as `from` embeds it, at the width a `|400` alias asks for. */
function embeddedImage(path: string, from: string, alias: string) {
  const width = IMAGE_SIZE.exec(alias.trim())?.groups?.width;

  return width === undefined
    ? attachmentLink(path, from)
    : imageTag({
        alt: path.split("/").at(-1) ?? path,
        src: attachmentDestination(path, from),
        title: null,
        width: Number(width),
      });
}

/**
 * What a wikilink title embeds from `from`, as markdown and the path its images
 * resolve against, or null when its note names nothing. A note answers first,
 * the way a click resolves it, so `images` runs only for an image's name no
 * note holds.
 * Rejects on a miss a folder the walk could not list may explain.
 */
export async function readEmbedded(
  notes: NoteMeta[],
  title: string,
  from: string,
  images: () => Promise<ImageList>
) {
  const { alias, link } = wikilinkParts(title);
  const target = linkResolver(notes).title(link, from);

  if (target !== undefined) {
    const { content } = await getNote(target.path);

    return { body: parseNote(content).body, image: false, path: target.path };
  }

  if (!isImageName(link.trim())) {
    return null;
  }

  const { paths, unreadable } = await images();
  const image = resolveImage(paths, link, from);

  if (image !== undefined) {
    return { body: embeddedImage(image, from, alias), image: true, path: from };
  }

  if (unreadable.length > 0) {
    throw new Error(`Could not read these folders: ${unreadable.join(", ")}`);
  }

  return null;
}
