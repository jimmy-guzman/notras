import { decode } from "mdurl";

import type { NoteMeta } from "./notes";
import { noteFolder, noteTitle } from "./notes";

/** One `[[target]]` or `[text](target.md)` as the index records it: `kind` says which, `target` as written, `line` as `grep -n` counts it. */
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
  /** What the UI finds in `context` to window on: `[[target]]` for a wikilink, the destination for a link, the title for a bare one. */
  match: string;
}

export interface Mention {
  lines: [MentionLine, ...MentionLine[]];
  note: NoteMeta;
}

export interface LinkResolver {
  path: (destination: string, from: string) => NoteMeta | undefined;
  row: (link: NoteLink) => NoteMeta | undefined;
  title: (target: string, from: string) => NoteMeta | undefined;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const NOTE_EXTENSION = /\.(?:md|markdown)$/i;

const FRAGMENT_OR_QUERY = /[#?]/;

/** Kept in parity with `is_note_path` in `src-tauri/src/index.rs`. */
export function isNotePath(destination: string) {
  if (
    destination.startsWith("#") ||
    destination.startsWith("/") ||
    SCHEME.test(destination)
  ) {
    return false;
  }

  const name =
    (destination.split(FRAGMENT_OR_QUERY, 1)[0] ?? "").split("/").at(-1) ?? "";

  return !name.startsWith(".") && NOTE_EXTENSION.test(name);
}

function joinNotePath(destination: string, from: string) {
  const bare = decode(destination.split(FRAGMENT_OR_QUERY, 1)[0] ?? "");
  const segments: string[] = [];

  for (const segment of [...noteFolder(from).split("/"), ...bare.split("/")]) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.pop() === undefined) {
        return;
      }

      continue;
    }

    segments.push(segment);
  }

  return segments.join("/");
}

function namesOf(meta: NoteMeta) {
  return new Set([
    meta.title.toLowerCase(),
    noteTitle(meta.path).toLowerCase(),
  ]);
}

/**
 * A title can come from a heading, so it is not unique, and a link written
 * against a filename has to keep working: hence both names, and the title
 * winning the tie. A path matches exactly first and then without regard to
 * case, since the disk under a Mac does the same.
 */
export function linkResolver(notes: NoteMeta[]): LinkResolver {
  const byName = Map.groupBy(
    notes.flatMap((meta) => [...namesOf(meta)].map((name) => ({ meta, name }))),
    ({ name }) => name
  );
  const byPath = new Map(notes.map((meta) => [meta.path, meta]));
  const byLowerPath = new Map(
    notes.map((meta) => [meta.path.toLowerCase(), meta])
  );

  const title: LinkResolver["title"] = (target, from) => {
    const wanted = target.trim().toLowerCase();
    const fromFolder = noteFolder(from);

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

  const path: LinkResolver["path"] = (destination, from) => {
    const joined = joinNotePath(destination, from);

    return joined === undefined
      ? undefined
      : (byPath.get(joined) ?? byLowerPath.get(joined.toLowerCase()));
  };

  return {
    path,
    row: (link) =>
      link.kind === "link"
        ? path(link.target, link.path)
        : title(link.target, link.path),
    title,
  };
}

export function matchOf(link: NoteLink) {
  return link.kind === "link" ? link.target : `[[${link.target}]]`;
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
  const resolve = linkResolver(notes);
  const byPath = new Map(notes.map((meta) => [meta.path, meta]));
  const title = byPath.get(path)?.title;
  const linked: SourcedLine[] = links
    .filter((link) => link.path !== path && resolve.row(link)?.path === path)
    .map((link) => ({
      context: link.context,
      line: link.line,
      match: matchOf(link),
      source: link.path,
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
