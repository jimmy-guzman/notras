import { Context, Effect, Layer } from "effect";

import type { NoteId } from "@/lib/id";
import type { SelectTag } from "@/server/db/schemas/tags";
import type { TagWithCount } from "@/server/repositories/tag-repository";

import {
  TagRepository,
  TagRepositoryLive,
} from "@/server/repositories/tag-repository";

interface ITagService {
  getAllTags(userId: string): Effect.Effect<TagWithCount[]>;
  getTagsForNote(userId: string, noteId: NoteId): Effect.Effect<SelectTag[]>;
  getTagsForNotes(
    userId: string,
    noteIds: NoteId[],
  ): Effect.Effect<Record<string, SelectTag[]>>;
  syncTags(
    userId: string,
    noteId: NoteId,
    tagNames: string[],
  ): Effect.Effect<void>;
}

export class TagService extends Context.Tag("TagService")<
  TagService,
  ITagService
>() {}

const makeTagService = Effect.gen(function* () {
  const tagRepo = yield* TagRepository;

  const getAllTags = (userId: string): Effect.Effect<TagWithCount[]> => {
    return tagRepo.findByUserId(userId).pipe(Effect.orDie);
  };

  const getTagsForNote = (
    userId: string,
    noteId: NoteId,
  ): Effect.Effect<SelectTag[]> => {
    return tagRepo.findByNoteId(noteId, userId).pipe(Effect.orDie);
  };

  const getTagsForNotes = (
    userId: string,
    noteIds: NoteId[],
  ): Effect.Effect<Record<string, SelectTag[]>> => {
    return tagRepo.findByNoteIds(noteIds, userId).pipe(Effect.orDie);
  };

  const syncTags = (
    userId: string,
    noteId: NoteId,
    tagNames: string[],
  ): Effect.Effect<void> => {
    return tagRepo.syncTagsForNote(noteId, userId, tagNames).pipe(Effect.orDie);
  };

  return {
    getAllTags,
    getTagsForNote,
    getTagsForNotes,
    syncTags,
  } satisfies ITagService;
});

export const TagServiceLive = Layer.effect(TagService, makeTagService).pipe(
  Layer.provide(TagRepositoryLive),
);
