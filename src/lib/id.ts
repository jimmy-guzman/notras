import type { TypeId } from "typeid-js";

import { typeidUnboxed } from "typeid-js";

export type NoteId = TypeId<"note">;

export function generateNoteId() {
  return typeidUnboxed("note");
}

/** Cast a raw string to NoteId (for route params, FormData, DB results). */
export function toNoteId(raw: string) {
  return raw as NoteId;
}
