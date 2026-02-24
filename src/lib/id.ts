import type { TypeId } from "typeid-js";

import { typeidUnboxed } from "typeid-js";

export type AssetId = TypeId<"asset">;
export type LinkId = TypeId<"link">;
export type NoteId = TypeId<"note">;

export function generateAssetId() {
  return typeidUnboxed("asset");
}

export function generateLinkId() {
  return typeidUnboxed("link");
}

export function generateNoteId() {
  return typeidUnboxed("note");
}

/** Cast a raw string to AssetId (for route params, FormData, DB results). */
export function toAssetId(raw: string) {
  return raw as AssetId;
}

/** Cast a raw string to LinkId (for route params, FormData, DB results). */
export function toLinkId(raw: string) {
  return raw as LinkId;
}

/** Cast a raw string to NoteId (for route params, FormData, DB results). */
export function toNoteId(raw: string) {
  return raw as NoteId;
}
