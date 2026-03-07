import { Context, Effect, Layer } from "effect";

import type { FolderId, NoteId } from "@/lib/id";
import type { SelectFolder } from "@/server/db/schemas/folders";
import type { FolderWithCount } from "@/server/repositories/folder-repository";

import { generateFolderId } from "@/lib/id";
import {
  FolderRepository,
  FolderRepositoryLive,
} from "@/server/repositories/folder-repository";
import {
  NoteRepository,
  NoteRepositoryLive,
} from "@/server/repositories/note-repository";

interface IFolderService {
  create(userId: string, name: string): Effect.Effect<FolderId>;
  delete(userId: string, folderId: FolderId): Effect.Effect<void>;
  getAll(userId: string): Effect.Effect<FolderWithCount[]>;
  getById(
    userId: string,
    folderId: FolderId,
  ): Effect.Effect<SelectFolder | undefined>;
  move(
    userId: string,
    noteId: NoteId,
    folderId: FolderId | null,
  ): Effect.Effect<void>;
  rename(userId: string, folderId: FolderId, name: string): Effect.Effect<void>;
}

export class FolderService extends Context.Tag("FolderService")<
  FolderService,
  IFolderService
>() {}

const makeFolderService = Effect.gen(function* () {
  const folderRepo = yield* FolderRepository;
  const noteRepo = yield* NoteRepository;

  const create = (userId: string, name: string) => {
    return Effect.gen(function* () {
      const id = generateFolderId();

      yield* folderRepo.create({ id, name, userId }).pipe(Effect.orDie);

      return id;
    });
  };

  const deleteFolder = (userId: string, folderId: FolderId) => {
    return folderRepo.delete(folderId, userId).pipe(Effect.orDie);
  };

  const getAll = (userId: string) => {
    return folderRepo.findByUserId(userId).pipe(Effect.orDie);
  };

  const getById = (userId: string, folderId: FolderId) => {
    return folderRepo.findById(folderId, userId).pipe(Effect.orDie);
  };

  const move = (userId: string, noteId: NoteId, folderId: FolderId | null) => {
    return noteRepo.moveToFolder(noteId, userId, folderId).pipe(Effect.orDie);
  };

  const rename = (userId: string, folderId: FolderId, name: string) => {
    return folderRepo.rename(folderId, userId, name).pipe(Effect.orDie);
  };

  return {
    create,
    delete: deleteFolder,
    getAll,
    getById,
    move,
    rename,
  } satisfies IFolderService;
});

export const FolderServiceLive = Layer.effect(
  FolderService,
  makeFolderService,
).pipe(Layer.provide(Layer.merge(FolderRepositoryLive, NoteRepositoryLive)));
