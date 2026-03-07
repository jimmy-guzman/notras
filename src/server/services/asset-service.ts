import { Context, Effect, Layer } from "effect";
import sharp from "sharp";

import type { AssetId, NoteId } from "@/lib/id";
import type { SelectAsset } from "@/server/db/schemas/assets";

import { generateAssetId, toAssetId } from "@/lib/id";
import {
  AssetRepository,
  AssetRepositoryLive,
} from "@/server/repositories/asset-repository";

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

async function processImage(
  buffer: Buffer,
  mimeType: string,
): Promise<OptimizedImage> {
  const isPassthrough =
    mimeType === "image/gif" || mimeType === "image/svg+xml";

  if (isPassthrough) {
    const metadata = await sharp(buffer).metadata();
    const h = metadata.height as number | undefined;
    const w = metadata.width as number | undefined;

    return {
      buffer,
      height: h ?? 0,
      mimeType,
      width: w ?? 0,
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

  const oh = outputMetadata.height as number | undefined;
  const ow = outputMetadata.width as number | undefined;

  return {
    buffer: optimized,
    height: oh ?? 0,
    mimeType: "image/webp",
    width: ow ?? 0,
  };
}

interface IAssetService {
  delete(userId: string, assetId: AssetId): Effect.Effect<void>;
  get(userId: string, assetId: AssetId): Effect.Effect<SelectAsset | undefined>;
  list(userId: string, noteId: NoteId): Effect.Effect<AssetMetadata[]>;
  upload(userId: string, noteId: NoteId, file: File): Effect.Effect<AssetId>;
}

export class AssetService extends Context.Tag("AssetService")<
  AssetService,
  IAssetService
>() {}

const makeAssetService = Effect.gen(function* () {
  const assetRepo = yield* AssetRepository;

  const deleteAsset = (userId: string, assetId: AssetId) => {
    return assetRepo.delete(assetId, userId).pipe(Effect.orDie);
  };

  const get = (userId: string, assetId: AssetId) => {
    return assetRepo.findById(assetId, userId).pipe(Effect.orDie);
  };

  const list = (userId: string, noteId: NoteId) => {
    return Effect.gen(function* () {
      const rows = yield* assetRepo
        .findMetadataByNoteId(noteId, userId)
        .pipe(Effect.orDie);

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
    });
  };

  const upload = (userId: string, noteId: NoteId, file: File) => {
    return Effect.gen(function* () {
      const id = generateAssetId();
      const buffer = Buffer.from(
        yield* Effect.promise(() => file.arrayBuffer()),
      );
      const isPdf = file.type === "application/pdf";

      let data: Buffer;
      let mimeType: string;
      let width = 0;
      let height = 0;

      if (isPdf) {
        data = buffer;
        mimeType = "application/pdf";
      } else {
        const result = yield* Effect.promise(() => {
          return processImage(buffer, file.type);
        });

        data = result.buffer;
        height = result.height;
        mimeType = result.mimeType;
        width = result.width;
      }

      yield* assetRepo
        .create({
          data,
          fileName: file.name,
          fileSize: data.length,
          height,
          id,
          mimeType,
          noteId,
          userId,
          width,
        })
        .pipe(Effect.orDie);

      return id;
    });
  };

  return {
    delete: deleteAsset,
    get,
    list,
    upload,
  } satisfies IAssetService;
});

export const AssetServiceLive = Layer.effect(
  AssetService,
  makeAssetService,
).pipe(Layer.provide(AssetRepositoryLive));
