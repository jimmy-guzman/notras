import { Context, Effect, Layer } from "effect";

import type { NoteId, TagId } from "@/lib/id";
import type { SelectTag } from "@/server/db/schemas/tags";
import type { TagWithCount } from "@/server/repositories/tag-repository";

import {
  TagRepository,
  TagRepositoryLive,
} from "@/server/repositories/tag-repository";

interface ITagService {
  ensureTags(userId: string, tagNames: string[]): Effect.Effect<TagId[]>;
  getAllTags(userId: string): Effect.Effect<TagWithCount[]>;
  getTagsForNote(userId: string, noteId: NoteId): Effect.Effect<SelectTag[]>;
  getTagsForNotes(
    userId: string,
    noteIds: NoteId[],
  ): Effect.Effect<Record<string, SelectTag[]>>;
}

export class TagService extends Context.Tag("TagService")<
  TagService,
  ITagService
>() {}

const makeTagService = Effect.gen(function* () {
  const tagRepo = yield* TagRepository;

  const ensureTags = (userId: string, tagNames: string[]) => {
    return tagRepo.ensureTags(userId, tagNames).pipe(Effect.orDie);
  };

  const getAllTags = (userId: string) => {
    return tagRepo.findByUserId(userId).pipe(Effect.orDie);
  };

  const getTagsForNote = (userId: string, noteId: NoteId) => {
    return tagRepo.findByNoteId(noteId, userId).pipe(Effect.orDie);
  };

  const getTagsForNotes = (userId: string, noteIds: NoteId[]) => {
    return tagRepo.findByNoteIds(noteIds, userId).pipe(Effect.orDie);
  };

  return {
    ensureTags,
    getAllTags,
    getTagsForNote,
    getTagsForNotes,
  } satisfies ITagService;
});

export const TagServiceLive = Layer.effect(TagService, makeTagService).pipe(
  Layer.provide(TagRepositoryLive),
);
