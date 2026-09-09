import type { NoteMeta } from "@/core/notes";

export interface SearchFilter {
  kind: "folder" | "tag";
  value: string;
}

interface SearchToken extends SearchFilter {
  end: number;
  start: number;
}

export interface NoteSearch {
  filters: SearchFilter[];
  incomplete: boolean;
  query: string;
}

const FILTER_START = /^(folder:|#)/;
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
        end: part.end,
        kind: prefix === "#" ? "tag" : "folder",
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

/** The last filter remains suggestible until whitespace follows it. */
export function searchSuggestion(input: string): SearchFilter | undefined {
  const token = scanSearch(input).tokens.findLast(
    ({ end }) => end === input.length
  );
  return token === undefined
    ? undefined
    : { kind: token.kind, value: token.value };
}

export function insertSearchFilter(
  input: string,
  filter: SearchFilter
): string {
  const token = scanSearch(input).tokens.findLast(
    ({ end, kind }) => end === input.length && kind === filter.kind
  );
  const escaped = filter.value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const value = NEEDS_QUOTES.test(filter.value) ? `"${escaped}"` : escaped;
  const prefix = filter.kind === "tag" ? "#" : `${filter.kind}:`;
  const before = token === undefined ? input : input.slice(0, token.start);
  return `${before}${before === "" || WHITESPACE.test(before.at(-1) ?? "") ? "" : " "}${prefix}${value} `;
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
      search.filters.every(({ kind, value }) =>
        kind === "tag"
          ? note.tags.includes(value)
          : value === "/" ||
            note.folder === value ||
            note.folder.startsWith(`${value}/`)
      )
    )
    .slice(0, 30);
}
