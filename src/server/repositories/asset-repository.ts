import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { AssetId, NoteId } from "@/lib/id";
import type { SelectAsset } from "@/server/db/schemas/assets";

import { Database } from "@/server/db";
import { asset } from "@/server/db/schemas/assets";
import { DatabaseError } from "@/server/errors";

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

type AssetMetadataRow = Omit<SelectAsset, "data">;

interface IAssetRepository {
  create(input: CreateAssetInput): Effect.Effect<void, DatabaseError>;
  createMany(inputs: CreateAssetInput[]): Effect.Effect<void, DatabaseError>;
  delete(assetId: AssetId, userId: string): Effect.Effect<void, DatabaseError>;
  deleteByNoteId(
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<void, DatabaseError>;
  findById(
    assetId: AssetId,
    userId: string,
  ): Effect.Effect<SelectAsset | undefined, DatabaseError>;
  findByNoteId(
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<SelectAsset[], DatabaseError>;
  findMetadataByNoteId(
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<AssetMetadataRow[], DatabaseError>;
}

export class AssetRepository extends Context.Tag("AssetRepository")<
  AssetRepository,
  IAssetRepository
>() {}

const makeDbAssetRepository = Effect.gen(function* () {
  const db = yield* Database;

  const create = (
    input: CreateAssetInput,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db.insert(asset).values({
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
      },
    });
  };

  const createMany = (
    inputs: CreateAssetInput[],
  ): Effect.Effect<void, DatabaseError> => {
    if (inputs.length === 0) {
      return Effect.void;
    }

    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db.insert(asset).values(
          inputs.map((input) => {
            return {
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
            };
          }),
        );
      },
    });
  };

  const deleteAsset = (
    assetId: AssetId,
    userId: string,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .delete(asset)
          .where(and(eq(asset.id, assetId), eq(asset.userId, userId)));
      },
    });
  };

  const deleteByNoteId = (
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .delete(asset)
          .where(and(eq(asset.noteId, noteId), eq(asset.userId, userId)));
      },
    });
  };

  const findById = (
    assetId: AssetId,
    userId: string,
  ): Effect.Effect<SelectAsset | undefined, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const results = await db
          .select()
          .from(asset)
          .where(and(eq(asset.id, assetId), eq(asset.userId, userId)))
          .limit(1);

        return results[0];
      },
    });
  };

  const findByNoteId = (
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<SelectAsset[], DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .select()
          .from(asset)
          .where(and(eq(asset.noteId, noteId), eq(asset.userId, userId)))
          .orderBy(desc(asset.createdAt));
      },
    });
  };

  const findMetadataByNoteId = (
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<AssetMetadataRow[], DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
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
      },
    });
  };

  return {
    create,
    createMany,
    delete: deleteAsset,
    deleteByNoteId,
    findById,
    findByNoteId,
    findMetadataByNoteId,
  } satisfies IAssetRepository;
});

export const AssetRepositoryLive = Layer.effect(
  AssetRepository,
  makeDbAssetRepository,
);
