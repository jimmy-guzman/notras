import { and, desc, eq } from "drizzle-orm";

import type { AssetId, NoteId } from "@/lib/id";
import type { Database } from "@/server/db";
import type { SelectAsset } from "@/server/db/schemas/assets";

import { asset } from "@/server/db/schemas/assets";

export interface CreateAssetInput {
  data: Buffer;
  fileName: string;
  fileSize: number;
  height: number;
  id: AssetId;
  mimeType: string;
  noteId: NoteId;
  userId: string;
  width: number;
}

export type AssetMetadataRow = Omit<SelectAsset, "data">;

export interface AssetRepository {
  create(input: CreateAssetInput): Promise<void>;
  delete(assetId: AssetId, userId: string): Promise<void>;
  findById(assetId: AssetId, userId: string): Promise<SelectAsset | undefined>;
  findMetadataByNoteId(
    noteId: NoteId,
    userId: string,
  ): Promise<AssetMetadataRow[]>;
}

export class DBAssetRepository implements AssetRepository {
  constructor(private db: Database) {}

  async create(input: CreateAssetInput): Promise<void> {
    await this.db.insert(asset).values({
      createdAt: new Date(),
      data: input.data,
      fileName: input.fileName,
      fileSize: input.fileSize,
      height: input.height,
      id: input.id,
      mimeType: input.mimeType,
      noteId: input.noteId,
      userId: input.userId,
      width: input.width,
    });
  }

  async delete(assetId: AssetId, userId: string): Promise<void> {
    await this.db
      .delete(asset)
      .where(and(eq(asset.id, assetId), eq(asset.userId, userId)));
  }

  async findById(
    assetId: AssetId,
    userId: string,
  ): Promise<SelectAsset | undefined> {
    const results = await this.db
      .select()
      .from(asset)
      .where(and(eq(asset.id, assetId), eq(asset.userId, userId)))
      .limit(1);

    return results[0];
  }

  async findMetadataByNoteId(
    noteId: NoteId,
    userId: string,
  ): Promise<AssetMetadataRow[]> {
    return this.db
      .select({
        createdAt: asset.createdAt,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        height: asset.height,
        id: asset.id,
        mimeType: asset.mimeType,
        noteId: asset.noteId,
        userId: asset.userId,
        width: asset.width,
      })
      .from(asset)
      .where(and(eq(asset.noteId, noteId), eq(asset.userId, userId)))
      .orderBy(desc(asset.createdAt));
  }
}
