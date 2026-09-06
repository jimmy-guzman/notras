import type { BareMention, Mention, NoteLink } from "./links";
import { linkResolver, matchOf, mentionsOf } from "./links";
import type { NoteMeta } from "./notes";

export type Hub =
  | { folder: string; kind: "folder" }
  | { kind: "tag"; tag: string };

export interface HubPill {
  count: number;
  hub: Hub;
}

export type RingMember =
  | { kind: "hub"; pill: HubPill }
  | { kind: "note"; note: NoteMeta };

export interface Graph {
  /** Targets this note links to that name no note, as written, each once. */
  dangling: string[];
  hubs: HubPill[];
  incoming: Mention[];
  /** Each note this one links to, with the lines of this note that do. */
  outgoing: Mention[];
}

export function hubKey(hub: Hub) {
  return hub.kind === "folder" ? `folder:${hub.folder}` : `tag:${hub.tag}`;
}

export function hubLabel(hub: Hub) {
  return hub.kind === "folder" ? hub.folder : `#${hub.tag}`;
}

function parentOf(folder: string) {
  const at = folder.lastIndexOf("/");

  return at === -1 ? "" : folder.slice(0, at);
}

/** Every folder a note sits in or under, so a folder holding only subfolders still exists. */
function folderTree(notes: NoteMeta[]) {
  const folders = new Set<string>();

  for (const note of notes) {
    const parts = note.folder.split("/").filter((part) => part !== "");

    for (let depth = 1; depth <= parts.length; depth += 1) {
      folders.add(parts.slice(0, depth).join("/"));
    }
  }

  return folders;
}

function byPath(left: NoteMeta, right: NoteMeta) {
  return left.path.localeCompare(right.path);
}

function children(folder: string, notes: NoteMeta[]) {
  return [...folderTree(notes)]
    .filter((candidate) => parentOf(candidate) === folder)
    .toSorted();
}

function notesIn(hub: Hub, notes: NoteMeta[]) {
  return notes
    .filter((note) =>
      hub.kind === "folder"
        ? note.folder === hub.folder
        : note.tags.includes(hub.tag)
    )
    .toSorted(byPath);
}

export function hubPill(hub: Hub, notes: NoteMeta[]): HubPill {
  const subfolders =
    hub.kind === "folder" ? children(hub.folder, notes).length : 0;

  return { count: subfolders + notesIn(hub, notes).length, hub };
}

export function hubRing(hub: Hub, notes: NoteMeta[]): RingMember[] {
  const members: RingMember[] = notesIn(hub, notes).map((note) => ({
    kind: "note",
    note,
  }));

  if (hub.kind === "tag") {
    return members;
  }

  const parent = parentOf(hub.folder);
  const up: RingMember[] =
    parent === ""
      ? []
      : [
          {
            kind: "hub",
            pill: hubPill({ folder: parent, kind: "folder" }, notes),
          },
        ];
  const down: RingMember[] = children(hub.folder, notes).map((folder) => ({
    kind: "hub",
    pill: hubPill({ folder, kind: "folder" }, notes),
  }));

  return [...up, ...down, ...members];
}

function hubsOf(note: NoteMeta, notes: NoteMeta[]): HubPill[] {
  const folder: Hub[] =
    note.folder === "" ? [] : [{ folder: note.folder, kind: "folder" }];
  const tags: Hub[] = note.tags.map((tag) => ({ kind: "tag", tag }));

  return [...folder, ...tags].map((hub) => hubPill(hub, notes));
}

/** A note's link to itself is not a neighbour. */
export function graphOf(
  path: string,
  links: NoteLink[],
  notes: NoteMeta[],
  bare: BareMention[]
): Graph {
  const resolve = linkResolver(notes);
  const outgoing = new Map<string, Mention>();
  const dangling = new Set<string>();

  for (const link of links.filter((row) => row.path === path)) {
    const note = resolve.row(link);

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
      match: matchOf(link),
    };
    const known = outgoing.get(note.path);

    if (known === undefined) {
      outgoing.set(note.path, { lines: [line], note });
    } else {
      known.lines.push(line);
    }
  }

  const centre = notes.find((meta) => meta.path === path);

  return {
    dangling: [...dangling],
    hubs: centre === undefined ? [] : hubsOf(centre, notes),
    incoming: mentionsOf(path, links, notes, bare),
    outgoing: [...outgoing.values()],
  };
}
