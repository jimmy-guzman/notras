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

/** A title written without brackets in another note's prose, found on read rather than indexed. */
export interface BareMention {
  context: string;
  line: number;
  path: string;
}

export interface MentionLine {
  context: string;
  line: number;
  /** What the UI finds in `context` to window on: `[[target]]` for a link, the title for a bare one. */
  match: string;
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

interface SourcedLine extends MentionLine {
  source: string;
}

function toLine({ context, line, match }: SourcedLine): MentionLine {
  return { context, line, match };
}

/** A note's links to itself are not mentions. */
export function mentionsOf(
  path: string,
  links: NoteLink[],
  notes: NoteMeta[],
  bare: BareMention[]
): Mention[] {
  const resolve = wikilinkResolver(notes);
  const byPath = new Map(notes.map((meta) => [meta.path, meta]));
  const title = byPath.get(path)?.title;
  const linked: SourcedLine[] = links
    .filter(
      (link) =>
        link.path !== path && resolve(link.target, link.path)?.path === path
    )
    .map(({ context, line, path: source, target }) => ({
      context,
      line,
      match: `[[${target}]]`,
      source,
    }));
  const spoken: SourcedLine[] =
    title === undefined
      ? []
      : bare.map(({ context, line, path: source }) => ({
          context,
          line,
          match: title,
          source,
        }));

  return [...Map.groupBy([...linked, ...spoken], (row) => row.source)]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([source, rows]) => {
      const note = byPath.get(source);
      const [first, ...rest] = rows
        .toSorted((left, right) => left.line - right.line)
        .map(toLine);

      // The rows and the note list are two reads of one index that a change
      // event refreshes together, so a source with no note is the moment
      // between the two landing. A group is never empty, which the type of
      // `first` cannot say.
      if (note === undefined || first === undefined) {
        return [];
      }

      const lines: Mention["lines"] = [first, ...rest];

      return [{ lines, note }];
    });
}
