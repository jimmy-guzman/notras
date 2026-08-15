import { Context, Effect, Layer } from "effect";

import type { NoteFileContent, NoteFilters, NoteMeta } from "@/core";

import {
  FileError,
  FileStore,
  noteFolder,
  notePath,
  noteTitle,
  parseNote,
  updateFrontmatter,
} from "@/core";
import {
  NoteRepository,
  NoteRepositoryLive,
} from "@/server/repositories/note-repository";

interface Note {
  content: string;
  path: string;
  pinned: boolean;
  tags: string[];
  title: string;
  updatedAt: Date;
}

interface INoteService {
  attach(sourcePath: string): Effect.Effect<string, FileError>;
  attachImage(base64Data: string): Effect.Effect<string, FileError>;
  count(): Effect.Effect<number>;
  create(options?: {
    content?: string;
    folder?: string;
    title?: string;
  }): Effect.Effect<string, FileError>;
  delete(path: string): Effect.Effect<void, FileError>;
  getByPath(path: string): Effect.Effect<Note, FileError>;
  list(filters?: NoteFilters): Effect.Effect<NoteMeta[]>;
  listFolders(): Effect.Effect<{ count: number; folder: string }[]>;
  listTags(): Effect.Effect<{ count: number; tag: string }[]>;
  move(path: string, folder: string): Effect.Effect<string, FileError>;
  rename(path: string, title: string): Effect.Effect<string, FileError>;
  setPinned(path: string, pinned: boolean): Effect.Effect<void, FileError>;
  setTags(path: string, tags: string[]): Effect.Effect<void, FileError>;
  write(path: string, content: string): Effect.Effect<Date, FileError>;
}

export class NoteService extends Context.Tag("NoteService")<
  NoteService,
  INoteService
>() {}

function toNote(path: string, file: NoteFileContent): Note {
  const parsed = parseNote(file.content);

  return {
    content: file.content,
    path,
    pinned: parsed.frontmatter.pinned,
    tags: parsed.frontmatter.tags,
    title: noteTitle(path),
    updatedAt: new Date(file.updatedAt),
  };
}

const makeNoteService = Effect.gen(function* () {
  const fileStore = yield* FileStore;
  const noteRepo = yield* NoteRepository;

  const rewriteFrontmatter = (
    path: string,
    patch: Parameters<typeof updateFrontmatter>[1],
  ) => {
    return Effect.gen(function* () {
      const file = yield* fileStore.read(path);
      const next = updateFrontmatter(file.content, patch);

      if (next !== file.content) {
        yield* fileStore.write(path, next);
      }
    });
  };

  const service: INoteService = {
    attach: (sourcePath) => {
      return fileStore.attach(sourcePath);
    },

    attachImage: (base64Data) => {
      return fileStore.attachImage(base64Data);
    },

    count: () => {
      return noteRepo.count().pipe(Effect.orDie);
    },

    create: (options) => {
      return Effect.gen(function* () {
        const folder = options?.folder ?? "";
        const baseTitle = options?.title ?? "untitled";

        let title = baseTitle;
        let counter = 1;

        while (yield* fileStore.exists(notePath(folder, title))) {
          counter += 1;
          title = `${baseTitle}-${counter}`;
        }

        const path = notePath(folder, title);

        yield* fileStore.write(path, options?.content ?? "");

        return path;
      });
    },

    delete: (path) => {
      return fileStore.delete(path);
    },

    getByPath: (path) => {
      return Effect.gen(function* () {
        const file = yield* fileStore.read(path);

        return toNote(path, file);
      });
    },

    list: (filters) => {
      return noteRepo.findMany(filters ?? {}).pipe(Effect.orDie);
    },

    listFolders: () => {
      return noteRepo.listFolders().pipe(Effect.orDie);
    },

    listTags: () => {
      return noteRepo.listTags().pipe(Effect.orDie);
    },

    move: (path, folder) => {
      return Effect.gen(function* () {
        const target = notePath(folder, noteTitle(path));

        if (target === path) {
          return path;
        }

        if (yield* fileStore.exists(target)) {
          return yield* new FileError({
            message: `a note named ${noteTitle(path)} already exists in ${
              folder === "" ? "the notes root" : folder
            }`,
          });
        }

        yield* fileStore.rename(path, target);

        return target;
      });
    },

    rename: (path, title) => {
      return Effect.gen(function* () {
        const target = notePath(noteFolder(path), title);

        if (target === path) {
          return path;
        }

        yield* fileStore.rename(path, target);

        return target;
      });
    },

    setPinned: (path, pinned) => {
      return rewriteFrontmatter(path, { pinned });
    },

    setTags: (path, tags) => {
      return rewriteFrontmatter(path, { tags });
    },

    write: (path, content) => {
      return Effect.gen(function* () {
        const updatedAt = yield* fileStore.write(path, content);

        return new Date(updatedAt);
      });
    },
  };

  return service;
});

export const NoteServiceLive = Layer.effect(NoteService, makeNoteService).pipe(
  Layer.provide(NoteRepositoryLive),
);
