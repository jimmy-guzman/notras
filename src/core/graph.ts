import type { BareMention, Mention, NoteLink } from "./links";
import { mentionsOf, wikilinkResolver } from "./links";
import type { NoteMeta } from "./notes";

export interface Graph {
  /** Targets this note links to that name no note, as written, each once. */
  dangling: string[];
  incoming: Mention[];
  /** Each note this one links to, with the lines of this note that do. */
  outgoing: Mention[];
}

/** A note's link to itself is not a neighbour. */
export function graphOf(
  path: string,
  links: NoteLink[],
  notes: NoteMeta[],
  bare: BareMention[]
): Graph {
  const resolve = wikilinkResolver(notes);
  const outgoing = new Map<string, Mention>();
  const dangling = new Set<string>();

  for (const link of links.filter((row) => row.path === path)) {
    const note = resolve(link.target, path);

    if (note === undefined) {
      dangling.add(link.target);
      continue;
    }

    if (note.path === path) {
      continue;
    }

    const line = {
      context: link.context,
      line: link.line,
      match: `[[${link.target}]]`,
    };
    const known = outgoing.get(note.path);

    if (known === undefined) {
      outgoing.set(note.path, { lines: [line], note });
    } else {
      known.lines.push(line);
    }
  }

  return {
    dangling: [...dangling],
    incoming: mentionsOf(path, links, notes, bare),
    outgoing: [...outgoing.values()],
  };
}
