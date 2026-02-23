import sharp from "sharp";

import type { AssetId, NoteId } from "@/lib/id";
import type { SelectAsset } from "@/server/db/schemas/assets";
import type { AssetRepository } from "@/server/repositories/asset-repository";

import { generateAssetId, toAssetId } from "@/lib/id";
import { getDb } from "@/server/db";
import { DBAssetRepository } from "@/server/repositories/asset-repository";

export interface AssetMetadata {
  createdAt: Date;
  fileName: string;
  fileSize: number;
  height: number;
  id: AssetId;
  mimeType: string;
  width: number;
}

interface OptimizedImage {
  buffer: Buffer;
  height: number;
  mimeType: string;
  width: number;
}

class AssetService {
  constructor(
    private assetRepo: AssetRepository,
    private idGenerator: () => AssetId = generateAssetId,
  ) {}

  private static async processImage(
    buffer: Buffer,
    mimeType: string,
  ): Promise<OptimizedImage> {
    const isPassthrough =
      mimeType === "image/gif" || mimeType === "image/svg+xml";

    if (isPassthrough) {
      const metadata = await sharp(buffer).metadata();

      return {
        buffer,
        height: metadata.height,
        mimeType,
        width: metadata.width,
      };
    }

    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (
      metadata.width &&
      metadata.height &&
      (metadata.width > 2000 || metadata.height > 2000)
    ) {
      image.resize(2000, 2000, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const optimized = await image.webp({ quality: 85 }).toBuffer();
    const outputMetadata = await sharp(optimized).metadata();

    return {
      buffer: optimized,
      height: outputMetadata.height,
      mimeType: "image/webp",
      width: outputMetadata.width,
    };
  }

  async delete(userId: string, assetId: AssetId): Promise<void> {
    await this.assetRepo.delete(assetId, userId);
  }

  async get(
    userId: string,
    assetId: AssetId,
  ): Promise<SelectAsset | undefined> {
    return this.assetRepo.findById(assetId, userId);
  }

  async list(userId: string, noteId: NoteId): Promise<AssetMetadata[]> {
    const rows = await this.assetRepo.findMetadataByNoteId(noteId, userId);

    return rows.map((row) => {
      return {
        createdAt: row.createdAt,
        fileName: row.fileName,
        fileSize: row.fileSize,
        height: row.height,
        id: toAssetId(row.id),
        mimeType: row.mimeType,
        width: row.width,
      };
    });
  }

  async upload(userId: string, noteId: NoteId, file: File): Promise<AssetId> {
    const id = this.idGenerator();
    const buffer = Buffer.from(await file.arrayBuffer());
    const isPdf = file.type === "application/pdf";

    let data: Buffer;
    let mimeType: string;
    let width = 0;
    let height = 0;

    if (isPdf) {
      data = buffer;
      mimeType = "application/pdf";
    } else {
      const result = await AssetService.processImage(buffer, file.type);

      data = result.buffer;
      height = result.height;
      mimeType = result.mimeType;
      width = result.width;
    }

    await this.assetRepo.create({
      data,
      fileName: file.name,
      fileSize: data.length,
      height,
      id,
      mimeType,
      noteId,
      userId,
      width,
    });

    return id;
  }
}

let _assetService: AssetService | undefined;

export function getAssetService() {
  _assetService ??= new AssetService(new DBAssetRepository(getDb()));

  return _assetService;
}
