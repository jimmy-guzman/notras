import { decode } from "mdurl";

import type { NoteMeta } from "@/core/notes";
import { noteFolder, noteTitle } from "@/core/notes";

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

/** Resolve a destination's path segments without looking up an indexed note. */
function resolveNotePath(
  destination: string,
  from: string
): string | undefined {
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

function comparePaths(left: string, right: string) {
  const leftPoints = Array.from(left, (char) => char.codePointAt(0));
  const rightPoints = Array.from(right, (char) => char.codePointAt(0));
  for (
    let at = 0;
    at < Math.max(leftPoints.length, rightPoints.length);
    at += 1
  ) {
    const a = leftPoints[at];
    const b = rightPoints[at];
    if (a === undefined) {
      return b === undefined ? 0 : -1;
    }
    if (b === undefined) {
      return 1;
    }
    if (a !== b) {
      return a - b;
    }
  }
  return 0;
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

        return byTitle || byFolder || comparePaths(left.path, right.path);
      })
      .at(0);
  };

  const path: LinkResolver["path"] = (destination, from) => {
    const joined = resolveNotePath(destination, from);

    return joined === undefined
      ? undefined
      : (byPath.get(joined) ?? byLowerPath.get(joined.toLowerCase()));
  };

  return {
    path,
    title,
  };
}
