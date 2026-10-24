import { parseNote } from "@/core/frontmatter";
import { linkResolver } from "@/core/links";
import type { NoteMeta } from "@/core/notes";

import { getNote } from "./get-note";

/**
 * The body and path of the note a wikilink title names from `from`, resolved
 * the way a click resolves it, or null when the title names no note.
 */
export async function readEmbeddedNote(
  notes: NoteMeta[],
  title: string,
  from: string
) {
  const target = linkResolver(notes).title(title, from);

  if (target === undefined) {
    return null;
  }

  const { content } = await getNote(target.path);

  return { body: parseNote(content).body, path: target.path };
}
