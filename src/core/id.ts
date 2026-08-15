import type { TypeId } from "typeid-js";

import { typeidUnboxed } from "typeid-js";

export type AssetId = TypeId<"asset">;
export type FolderId = TypeId<"folder">;
export type LinkId = TypeId<"link">;
export type NoteId = TypeId<"note">;
export type TagId = TypeId<"tag">;

export function generateAssetId() {
  return typeidUnboxed("asset");
}

export function generateFolderId() {
  return typeidUnboxed("folder");
}

export function generateLinkId() {
  return typeidUnboxed("link");
}

export function generateNoteId() {
  return typeidUnboxed("note");
}

export function generateTagId() {
  return typeidUnboxed("tag");
}

/** Cast a raw string to AssetId (for route params, FormData, DB results). */
export function toAssetId(raw: string) {
  return raw as AssetId;
}

/** Cast a raw string to FolderId (for route params, FormData, DB results). */
export function toFolderId(raw: string) {
  return raw as FolderId;
}

/** Cast a raw string to LinkId (for route params, FormData, DB results). */
export function toLinkId(raw: string) {
  return raw as LinkId;
}

/** Cast a raw string to NoteId (for route params, FormData, DB results). */
export function toNoteId(raw: string) {
  return raw as NoteId;
}
