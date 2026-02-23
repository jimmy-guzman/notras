import type { TypeId } from "typeid-js";

import { typeidUnboxed } from "typeid-js";

export type AssetId = TypeId<"asset">;
export type NoteId = TypeId<"note">;

export function generateAssetId() {
  return typeidUnboxed("asset");
}

export function generateNoteId() {
  return typeidUnboxed("note");
}

/** Cast a raw string to AssetId (for route params, FormData, DB results). */
export function toAssetId(raw: string) {
  return raw as AssetId;
}

/** Cast a raw string to NoteId (for route params, FormData, DB results). */
export function toNoteId(raw: string) {
  return raw as NoteId;
}
