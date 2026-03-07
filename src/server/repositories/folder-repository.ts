import { and, count as drizzleCount, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { FolderId } from "@/lib/id";
import type { SelectFolder } from "@/server/db/schemas/folders";

import { Database } from "@/server/db";
import { folder } from "@/server/db/schemas/folders";
import { note } from "@/server/db/schemas/notes";
import { DatabaseError } from "@/server/errors";

export interface FolderWithCount extends SelectFolder {
  noteCount: number;
}

interface CreateFolderInput {
  id: FolderId;
  name: string;
  userId: string;
}

interface UpsertFolderInput {
  createdAt: Date;
  id: FolderId;
  name: string;
  updatedAt: Date;
  userId: string;
}

interface IFolderRepository {
  create(input: CreateFolderInput): Effect.Effect<void, DatabaseError>;
  delete(
    folderId: FolderId,
    userId: string,
  ): Effect.Effect<void, DatabaseError>;
  deleteAllByUserId(userId: string): Effect.Effect<void, DatabaseError>;
  findById(
    folderId: FolderId,
    userId: string,
  ): Effect.Effect<SelectFolder | undefined, DatabaseError>;
  findByUserId(userId: string): Effect.Effect<FolderWithCount[], DatabaseError>;
  rename(
    folderId: FolderId,
    userId: string,
    name: string,
  ): Effect.Effect<void, DatabaseError>;
  upsert(input: UpsertFolderInput): Effect.Effect<void, DatabaseError>;
}

export class FolderRepository extends Context.Tag("FolderRepository")<
  FolderRepository,
  IFolderRepository
>() {}

const makeDbFolderRepository = Effect.gen(function* () {
  const db = yield* Database;

  const create = (
    input: CreateFolderInput,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db.insert(folder).values({
          createdAt: new Date(),
          id: input.id,
          name: input.name,
          updatedAt: new Date(),
          userId: input.userId,
        });
      },
    });
  };

  const deleteFolder = (
    folderId: FolderId,
    userId: string,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .delete(folder)
          .where(and(eq(folder.id, folderId), eq(folder.userId, userId)));
      },
    });
  };

  const deleteAllByUserId = (
    userId: string,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => db.delete(folder).where(eq(folder.userId, userId)),
    });
  };

  const findById = (
    folderId: FolderId,
    userId: string,
  ): Effect.Effect<SelectFolder | undefined, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const results = await db
          .select()
          .from(folder)
          .where(and(eq(folder.id, folderId), eq(folder.userId, userId)))
          .limit(1);

        return results.length > 0 ? results[0] : undefined;
      },
    });
  };

  const findByUserId = (
    userId: string,
  ): Effect.Effect<FolderWithCount[], DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .select({
            createdAt: folder.createdAt,
            id: folder.id,
            name: folder.name,
            noteCount: drizzleCount(note.id),
            updatedAt: folder.updatedAt,
            userId: folder.userId,
          })
          .from(folder)
          .leftJoin(
            note,
            and(eq(note.folderId, folder.id), eq(note.userId, userId)),
          )
          .where(eq(folder.userId, userId))
          .groupBy(folder.id)
          .orderBy(folder.name);
      },
    });
  };

  const rename = (
    folderId: FolderId,
    userId: string,
    name: string,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .update(folder)
          .set({ name, updatedAt: new Date() })
          .where(and(eq(folder.id, folderId), eq(folder.userId, userId)));
      },
    });
  };

  const upsert = (
    input: UpsertFolderInput,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .insert(folder)
          .values({
            createdAt: input.createdAt,
            id: input.id,
            name: input.name,
            updatedAt: input.updatedAt,
            userId: input.userId,
          })
          .onConflictDoUpdate({
            set: {
              name: input.name,
              updatedAt: input.updatedAt,
            },
            target: folder.id,
          });
      },
    });
  };

  return {
    create,
    delete: deleteFolder,
    deleteAllByUserId,
    findById,
    findByUserId,
    rename,
    upsert,
  } satisfies IFolderRepository;
});

export const FolderRepositoryLive = Layer.effect(
  FolderRepository,
  makeDbFolderRepository,
);
