import { Context, Effect, Layer } from "effect";

import type { NoteId } from "@/lib/id";
import type { SelectNote } from "@/server/db/schemas/notes";
import type { NoteFilters } from "@/server/repositories/note-repository";

import { generateNoteId } from "@/lib/id";
import {
  NoteRepository,
  NoteRepositoryLive,
} from "@/server/repositories/note-repository";
import {
  FormatService,
  FormatServiceLive,
} from "@/server/services/format-service";
import { LinkService, LinkServiceLive } from "@/server/services/link-service";
import { TagService, TagServiceLive } from "@/server/services/tag-service";

interface INoteService {
  clearReminder(userId: string, noteId: NoteId): Effect.Effect<void>;
  count(userId: string): Effect.Effect<number>;
  countOverdueReminders(userId: string): Effect.Effect<number>;
  create(
    userId: string,
    content: string,
    tags?: string[],
  ): Effect.Effect<NoteId>;
  delete(userId: string, noteId: NoteId): Effect.Effect<void>;
  getById(
    userId: string,
    noteId: NoteId,
  ): Effect.Effect<SelectNote | undefined>;
  getDueReminders(userId: string): Effect.Effect<SelectNote[]>;
  list(userId: string, filters: NoteFilters): Effect.Effect<SelectNote[]>;
  pin(userId: string, noteId: NoteId): Effect.Effect<void>;
  setReminder(
    userId: string,
    noteId: NoteId,
    remindAt: Date,
  ): Effect.Effect<void>;
  unpin(userId: string, noteId: NoteId): Effect.Effect<void>;
  update(
    userId: string,
    noteId: NoteId,
    content: string,
    tags?: string[],
  ): Effect.Effect<void>;
}

export class NoteService extends Context.Tag("NoteService")<
  NoteService,
  INoteService
>() {}

const makeNoteService = Effect.gen(function* () {
  const noteRepo = yield* NoteRepository;
  const formatService = yield* FormatService;
  const linkService = yield* LinkService;
  const tagService = yield* TagService;

  const clearReminder = (userId: string, noteId: NoteId) => {
    return noteRepo.clearReminder(noteId, userId).pipe(Effect.orDie);
  };

  const count = (userId: string) => noteRepo.count(userId).pipe(Effect.orDie);

  const countOverdueReminders = (userId: string) => {
    return noteRepo.countOverdueReminders(userId).pipe(Effect.orDie);
  };

  const create = (userId: string, content: string, tags?: string[]) => {
    return Effect.gen(function* () {
      const id = generateNoteId();
      const formatted = yield* formatService.formatMarkdown(content);

      yield* noteRepo
        .create({ content: formatted, id, userId })
        .pipe(Effect.orDie);

      // Fire-and-forget link sync
      Effect.runFork(linkService.syncLinks(userId, id, formatted));

      if (tags !== undefined) {
        yield* tagService.syncTags(userId, id, tags);
      }

      return id;
    });
  };

  const deleteNote = (userId: string, noteId: NoteId) => {
    return noteRepo.delete(noteId, userId).pipe(Effect.orDie);
  };

  const getById = (userId: string, noteId: NoteId) => {
    return noteRepo.findById(noteId, userId).pipe(Effect.orDie);
  };

  const getDueReminders = (userId: string) => {
    return noteRepo.findDueReminders(userId).pipe(Effect.orDie);
  };

  const list = (userId: string, filters: NoteFilters) => {
    return noteRepo.findMany(userId, filters).pipe(Effect.orDie);
  };

  const pin = (userId: string, noteId: NoteId) => {
    return noteRepo.pin(noteId, userId).pipe(Effect.orDie);
  };

  const setReminder = (userId: string, noteId: NoteId, remindAt: Date) => {
    return noteRepo.setReminder(noteId, userId, remindAt).pipe(Effect.orDie);
  };

  const unpin = (userId: string, noteId: NoteId) => {
    return noteRepo.unpin(noteId, userId).pipe(Effect.orDie);
  };

  const update = (
    userId: string,
    noteId: NoteId,
    content: string,
    tags?: string[],
  ) => {
    return Effect.gen(function* () {
      const formatted = yield* formatService.formatMarkdown(content);

      yield* noteRepo
        .update(noteId, userId, { content: formatted })
        .pipe(Effect.orDie);

      // Fire-and-forget link sync
      Effect.runFork(linkService.syncLinks(userId, noteId, formatted));

      if (tags !== undefined) {
        yield* tagService.syncTags(userId, noteId, tags);
      }
    });
  };

  return {
    clearReminder,
    count,
    countOverdueReminders,
    create,
    delete: deleteNote,
    getById,
    getDueReminders,
    list,
    pin,
    setReminder,
    unpin,
    update,
  } satisfies INoteService;
});

export const NoteServiceLive = Layer.effect(NoteService, makeNoteService).pipe(
  Layer.provide(
    Layer.mergeAll(
      NoteRepositoryLive,
      FormatServiceLive,
      LinkServiceLive,
      TagServiceLive,
    ),
  ),
);
