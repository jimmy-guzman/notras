import type { BareMention, NoteLink } from "@/core/links";
import { linkResolver, mentionsOf } from "@/core/links";
import type { NoteMeta } from "@/core/notes";

export interface SearchFilter {
  kind: "folder" | "from" | "link" | "mention" | "tag" | "to";
  value: string;
}

interface SearchToken extends SearchFilter {
  complete: boolean;
  end: number;
  start: number;
}

export interface NoteSearch {
  filters: SearchFilter[];
  incomplete: boolean;
  query: string;
}

const FILTER_START = /^(folder:|from:|link:|mention:|to:|#)/;

function filterKind(prefix: string): SearchFilter["kind"] {
  switch (prefix) {
    case "folder:":
      return "folder";
    case "from:":
      return "from";
    case "link:":
      return "link";
    case "mention:":
      return "mention";
    case "to:":
      return "to";
    default:
      return "tag";
  }
}
const WHITESPACE = /\s/;
const NEEDS_QUOTES = /[\s"\\]/;

function readValue(input: string, start: number) {
  const quoted = input[start] === '"';
  let end = start + Number(quoted);
  let value = "";

  while (end < input.length) {
    const char = input[end];
    if (char === "\\" && (input[end + 1] === '"' || input[end + 1] === "\\")) {
      value += input[end + 1];
      end += 2;
    } else if (quoted && char === '"') {
      return {
        complete:
          value.length > 0 &&
          (end + 1 === input.length || WHITESPACE.test(input[end + 1] ?? "")),
        end: end + 1,
        value,
      };
    } else if (!quoted && WHITESPACE.test(char ?? "")) {
      break;
    } else {
      value += char;
      end += 1;
    }
  }

  return { complete: !quoted && value.length > 0, end, value };
}

function scanSearch(input: string) {
  const tokens: SearchToken[] = [];
  const words: string[] = [];
  let incomplete = false;
  let offset = 0;

  while (offset < input.length) {
    if (WHITESPACE.test(input[offset] ?? "")) {
      offset += 1;
      continue;
    }
    const prefix = input.slice(offset).match(FILTER_START)?.[0];
    const part = readValue(input, offset + (prefix?.length ?? 0));
    if (prefix === undefined) {
      words.push(input.slice(offset, part.end));
    } else {
      tokens.push({
        complete: part.complete,
        end: part.end,
        kind: filterKind(prefix),
        start: offset,
        value: prefix === "#" ? part.value.toLowerCase() : part.value,
      });
      incomplete ||= !part.complete;
    }
    offset = part.end;
  }

  return { incomplete, query: words.join(" "), tokens };
}

export function parseSearch(input: string): NoteSearch {
  const { incomplete, query, tokens } = scanSearch(input);
  return {
    filters: tokens.map(({ kind, value }) => ({ kind, value })),
    incomplete,
    query,
  };
}

/** Incomplete filters and the filter currently being typed offer suggestions. */
export function searchSuggestion(
  input: string,
  cursor = input.length
): SearchFilter | undefined {
  const { tokens } = scanSearch(input);
  const token =
    tokens.find(({ end, start }) => start <= cursor && cursor <= end) ??
    tokens.findLast(({ complete }) => !complete);
  return token === undefined
    ? undefined
    : { kind: token.kind, value: token.value };
}

export function insertSearchFilter(
  input: string,
  filter: SearchFilter,
  cursor = input.length
): string {
  const { tokens } = scanSearch(input);
  const candidate =
    tokens.find(({ end, start }) => start <= cursor && cursor <= end) ??
    tokens.findLast(({ complete }) => !complete);
  const token = candidate?.kind === filter.kind ? candidate : undefined;
  const escaped = filter.value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const value = NEEDS_QUOTES.test(filter.value) ? `"${escaped}"` : escaped;
  const prefix = filter.kind === "tag" ? "#" : `${filter.kind}:`;
  const before = token === undefined ? input : input.slice(0, token.start);
  const after = token === undefined ? "" : input.slice(token.end).trimStart();
  return `${before}${before === "" || WHITESPACE.test(before.at(-1) ?? "") ? "" : " "}${prefix}${value} ${after}`;
}

export function searchFolders(
  notes: NoteMeta[]
): { count: number; folder: string }[] {
  const folders = notes.flatMap(({ folder }) => [
    "/",
    ...folder
      .split("/")
      .flatMap((_, index, parts) =>
        folder === "" ? [] : [parts.slice(0, index + 1).join("/")]
      ),
  ]);
  return [...Map.groupBy(folders, (folder) => folder)]
    .map(([folder, rows]) => ({ count: rows.length, folder }))
    .toSorted((left, right) => left.folder.localeCompare(right.folder));
}

/** Contexts keyed by result path, resolved against the complete library. */
export function searchFilterMatches(
  filter: SearchFilter,
  notes: NoteMeta[],
  links: NoteLink[],
  bare: BareMention[]
): Map<string, string | null> {
  const { kind, value } = filter;
  if (kind === "folder" || kind === "tag") {
    return new Map(
      notes
        .filter((note) =>
          kind === "tag"
            ? note.tags.includes(value)
            : value === "/" ||
              note.folder === value ||
              note.folder.startsWith(`${value}/`)
        )
        .map((note) => [note.path, null])
    );
  }
  if (kind === "mention") {
    return new Map(bare.map(({ context, path }) => [path, context]));
  }
  if (kind === "link") {
    return new Map(
      links
        .filter(({ target: destination }) =>
          destination.toLowerCase().includes(value.toLowerCase())
        )
        .map(({ context, path }) => [path, context])
    );
  }
  const target = notes.find(({ path }) => path === value);
  if (target === undefined) {
    return new Map();
  }
  if (kind === "to") {
    return new Map(
      mentionsOf(target.path, links, notes, bare).map(({ lines, note }) => [
        note.path,
        lines[0].context,
      ])
    );
  }
  const resolve = linkResolver(notes);
  return new Map(
    links
      .filter(({ path }) => path === target.path)
      .flatMap((link) => {
        const note = resolve.row(link);
        return note === undefined || note.path === target.path
          ? []
          : [[note.path, `${target.title} (${target.path}): ${link.context}`]];
      })
  );
}

/** Input notes already carry FTS ranking; all filters precede the palette cap. */
export function filterSearchNotes(
  notes: NoteMeta[],
  search: NoteSearch
): NoteMeta[] {
  if (search.incomplete) {
    return [];
  }
  return notes
    .filter((note) =>
      search.filters.every(({ kind, value }) => {
        if (kind === "tag") {
          return note.tags.includes(value);
        }
        if (kind === "folder") {
          return (
            value === "/" ||
            note.folder === value ||
            note.folder.startsWith(`${value}/`)
          );
        }
        return true;
      })
    )
    .slice(0, 30);
}
