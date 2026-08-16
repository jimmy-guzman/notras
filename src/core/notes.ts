export interface NoteMeta {
  createdAt: Date;
  folder: string;
  path: string;
  pinned: boolean;
  snippet: null | string;
  tags: string[];
  title: string;
  updatedAt: Date;
}

export interface NoteFilters {
  folder?: string;
  limit?: number;
  pinnedOnly?: boolean;
  query?: string;
  /** Default ordering is pinned-first; "updated" is strict recency. */
  sort?: "updated";
  tag?: string;
}

/** Valid note title: no path separators or colons, not hidden, not blank. */
export const NOTE_TITLE_PATTERN = /^(?!\.)[^/\\:]+$/;

export function noteTitle(path: string) {
  const name = path.split("/").at(-1) ?? path;

  return name.replace(/\.(?:md|markdown)$/i, "");
}

export function noteFolder(path: string) {
  const index = path.lastIndexOf("/");

  return index === -1 ? "" : path.slice(0, index);
}

export function notePath(folder: string, title: string) {
  return folder === "" ? `${title}.md` : `${folder}/${title}.md`;
}
