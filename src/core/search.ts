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

const FILTER_PREFIXES = [
  ["folder:", "folder"],
  ["from:", "from"],
  ["link:", "link"],
  ["mention:", "mention"],
  ["to:", "to"],
  ["#", "tag"],
] as const satisfies readonly (readonly [string, SearchFilter["kind"]])[];

const WHITESPACE = /\s/u;
const NEEDS_QUOTES = /[\s"\\]/u;

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

    const rest = input.slice(offset);
    const filter = FILTER_PREFIXES.find(([prefix]) => rest.startsWith(prefix));

    const part = readValue(input, offset + (filter?.[0].length ?? 0));

    if (filter === undefined) {
      words.push(input.slice(offset, part.end));
    } else {
      const [, kind] = filter;

      tokens.push({
        complete: part.complete,
        end: part.end,
        kind,
        start: offset,
        value: kind === "tag" ? part.value.toLowerCase() : part.value,
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

/** Every folder, empty ones included, with the number of notes anywhere under it. */
export function searchFolders(
  folders: string[],
  notes: NoteMeta[]
): { count: number; folder: string }[] {
  const counts = Map.groupBy(
    notes.flatMap(({ folder }) =>
      folder === ""
        ? []
        : folder
            .split("/")
            .map((_, index, parts) => parts.slice(0, index + 1).join("/"))
    ),
    (folder) => folder
  );

  return folders
    .map((folder) => ({ count: counts.get(folder)?.length ?? 0, folder }))
    .toSorted((left, right) => left.folder.localeCompare(right.folder));
}
