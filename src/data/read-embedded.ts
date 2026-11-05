import { parseNote } from "@/core/frontmatter";
import { linkResolver, resolveImage } from "@/core/links";
import type { NoteMeta } from "@/core/notes";
import { attachmentLink, isImageName } from "@/lib/utils/attachments";
import type { ImageList } from "@/server/adapters/bindings";

import { getNote } from "./get-note";

/**
 * What a wikilink title embeds from `from`, as markdown and the path its images
 * resolve against, or null when it names nothing. A note answers first, the way
 * a click resolves it, so `images` runs only for an image's name no note holds.
 * Rejects on a miss a folder the walk could not list may explain.
 */
export async function readEmbedded(
  notes: NoteMeta[],
  title: string,
  from: string,
  images: () => Promise<ImageList>
) {
  const target = linkResolver(notes).title(title, from);

  if (target !== undefined) {
    const { content } = await getNote(target.path);

    return { body: parseNote(content).body, image: false, path: target.path };
  }

  if (!isImageName(title.trim())) {
    return null;
  }

  const { paths, unreadable } = await images();
  const image = resolveImage(paths, title, from);

  if (image !== undefined) {
    return { body: attachmentLink(image, from), image: true, path: from };
  }

  if (unreadable.length > 0) {
    throw new Error(`Could not read these folders: ${unreadable.join(", ")}`);
  }

  return null;
}
