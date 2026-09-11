import type { Mention } from "@/core/links";
import type { NoteMeta } from "@/core/notes";

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

export type Picture =
  | (Graph & { kind: "note"; note: NoteMeta })
  | { hub: HubPill; kind: "hub"; members: RingMember[] };
