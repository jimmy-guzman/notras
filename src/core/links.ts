import type { NoteMeta } from "./notes";
import { noteFolder, noteTitle } from "./notes";

/** One `[[target]]` as the index records it: `target` as written, `line` as `grep -n` counts it. */
export interface NoteLink {
  context: string;
  kind: string;
  line: number;
  path: string;
  target: string;
}

export interface MentionLine {
  context: string;
  line: number;
  target: string;
}

export interface Mention {
  lines: [MentionLine, ...MentionLine[]];
  note: NoteMeta;
}

export type WikilinkResolver = (
  target: string,
  fromPath: string
) => NoteMeta | undefined;

function namesOf(meta: NoteMeta) {
  return new Set([
    meta.title.toLowerCase(),
    noteTitle(meta.path).toLowerCase(),
  ]);
}

/**
 * A title can come from a heading, so it is not unique, and a link written
 * against a filename has to keep working: hence both names, and the title
 * winning the tie.
 */
export function wikilinkResolver(notes: NoteMeta[]): WikilinkResolver {
  const byName = Map.groupBy(
    notes.flatMap((meta) => [...namesOf(meta)].map((name) => ({ meta, name }))),
    ({ name }) => name
  );

  return (target, fromPath) => {
    const wanted = target.trim().toLowerCase();
    const fromFolder = noteFolder(fromPath);

    return (byName.get(wanted) ?? [])
      .map(({ meta }) => meta)
      .toSorted((left, right) => {
        const byTitle =
          Number(right.title.toLowerCase() === wanted) -
          Number(left.title.toLowerCase() === wanted);
        const byFolder =
          Number(noteFolder(right.path) === fromFolder) -
          Number(noteFolder(left.path) === fromFolder);

        return byTitle || byFolder || left.path.localeCompare(right.path);
      })
      .at(0);
  };
}

function toLine({ context, line, target }: NoteLink): MentionLine {
  return { context, line, target };
}

/** A note's links to itself are not mentions. */
export function mentionsOf(
  path: string,
  links: NoteLink[],
  notes: NoteMeta[]
): Mention[] {
  const resolve = wikilinkResolver(notes);
  const byPath = new Map(notes.map((meta) => [meta.path, meta]));
  const inbound = links.filter(
    (link) =>
      link.path !== path && resolve(link.target, link.path)?.path === path
  );

  return [...Map.groupBy(inbound, (link) => link.path)]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([source, [first, ...rest]]) => {
      const note = byPath.get(source);

      // The rows and the note list are two reads of one index that a change
      // event refreshes together, so a source with no note is the moment
      // between the two landing. A group is never empty, which the type of
      // `first` cannot say.
      if (note === undefined || first === undefined) {
        return [];
      }

      const lines: Mention["lines"] = [toLine(first), ...rest.map(toLine)];

      return [{ lines, note }];
    });
}
