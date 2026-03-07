import {
  and,
  count as drizzleCount,
  eq,
  inArray,
  notExists,
  notInArray,
} from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { NoteId, TagId } from "@/lib/id";
import type { SelectTag } from "@/server/db/schemas/tags";

import { generateTagId } from "@/lib/id";
import { Database } from "@/server/db";
import { noteTag, tag } from "@/server/db/schemas/tags";
import { DatabaseError } from "@/server/errors";

export interface TagWithCount extends SelectTag {
  noteCount: number;
}

interface ITagRepository {
  deleteOrphanedTags(userId: string): Effect.Effect<void, DatabaseError>;
  findByNoteId(
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<SelectTag[], DatabaseError>;
  findByNoteIds(
    noteIds: NoteId[],
    userId: string,
  ): Effect.Effect<Record<string, SelectTag[]>, DatabaseError>;
  findByUserId(userId: string): Effect.Effect<TagWithCount[], DatabaseError>;
  syncTagsForNote(
    noteId: NoteId,
    userId: string,
    tagNames: string[],
  ): Effect.Effect<void, DatabaseError>;
}

export class TagRepository extends Context.Tag("TagRepository")<
  TagRepository,
  ITagRepository
>() {}

const makeDbTagRepository = Effect.gen(function* () {
  const db = yield* Database;

  const deleteOrphanedTags = (
    userId: string,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .delete(tag)
          .where(
            and(
              eq(tag.userId, userId),
              notExists(
                db
                  .select({ tagId: noteTag.tagId })
                  .from(noteTag)
                  .where(eq(noteTag.tagId, tag.id)),
              ),
            ),
          );
      },
    });
  };

  const findByNoteId = (
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<SelectTag[], DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const rows = await db
          .select({ tag })
          .from(noteTag)
          .innerJoin(tag, eq(noteTag.tagId, tag.id))
          .where(and(eq(noteTag.noteId, noteId), eq(tag.userId, userId)));

        return rows.map((r) => r.tag);
      },
    });
  };

  const findByNoteIds = (
    noteIds: NoteId[],
    userId: string,
  ): Effect.Effect<Record<string, SelectTag[]>, DatabaseError> => {
    if (noteIds.length === 0) {
      return Effect.succeed({});
    }

    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const rows = await db
          .select({ noteId: noteTag.noteId, tag })
          .from(noteTag)
          .innerJoin(tag, eq(noteTag.tagId, tag.id))
          .where(and(inArray(noteTag.noteId, noteIds), eq(tag.userId, userId)));

        const result: Record<string, SelectTag[]> = {};

        for (const row of rows) {
          const existing = result[row.noteId] ?? [];

          existing.push(row.tag);
          result[row.noteId] = existing;
        }

        return result;
      },
    });
  };

  const findByUserId = (
    userId: string,
  ): Effect.Effect<TagWithCount[], DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const rows = await db
          .select({ noteCount: drizzleCount(noteTag.noteId), tag })
          .from(tag)
          .leftJoin(noteTag, eq(noteTag.tagId, tag.id))
          .where(eq(tag.userId, userId))
          .groupBy(tag.id);

        return rows.map((r) => ({ ...r.tag, noteCount: r.noteCount }));
      },
    });
  };

  const syncTagsForNote = (
    noteId: NoteId,
    userId: string,
    tagNames: string[],
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db.transaction(async (tx) => {
          if (tagNames.length === 0) {
            await tx.delete(noteTag).where(eq(noteTag.noteId, noteId));
            await tx
              .delete(tag)
              .where(
                and(
                  eq(tag.userId, userId),
                  notExists(
                    tx
                      .select({ tagId: noteTag.tagId })
                      .from(noteTag)
                      .where(eq(noteTag.tagId, tag.id)),
                  ),
                ),
              );

            return;
          }

          const existingRows = await tx
            .select()
            .from(tag)
            .where(and(eq(tag.userId, userId), inArray(tag.name, tagNames)));

          const existingByName = new Map(
            existingRows.map((r) => [r.name, r.id]),
          );

          const newNames = tagNames.filter((n) => !existingByName.has(n));

          if (newNames.length > 0) {
            const newRows = newNames.map((name) => {
              return {
                createdAt: new Date(),
                id: generateTagId(),
                name,
                userId,
              };
            });

            await tx.insert(tag).values(newRows).onConflictDoNothing();

            const inserted = await tx
              .select()
              .from(tag)
              .where(and(eq(tag.userId, userId), inArray(tag.name, newNames)));

            for (const row of inserted) {
              existingByName.set(row.name, row.id);
            }
          }

          const tagIds = tagNames
            .map((n) => existingByName.get(n))
            .filter((id): id is string => id !== undefined) as TagId[];

          await tx
            .delete(noteTag)
            .where(
              and(
                eq(noteTag.noteId, noteId),
                notInArray(noteTag.tagId, tagIds),
              ),
            );

          if (tagIds.length > 0) {
            const rows = tagIds.map((tagId) => {
              return { createdAt: new Date(), noteId, tagId };
            });

            await tx.insert(noteTag).values(rows).onConflictDoNothing();
          }

          await tx
            .delete(tag)
            .where(
              and(
                eq(tag.userId, userId),
                notExists(
                  tx
                    .select({ tagId: noteTag.tagId })
                    .from(noteTag)
                    .where(eq(noteTag.tagId, tag.id)),
                ),
              ),
            );
        });
      },
    });
  };

  return {
    deleteOrphanedTags,
    findByNoteId,
    findByNoteIds,
    findByUserId,
    syncTagsForNote,
  } satisfies ITagRepository;
});

export const TagRepositoryLive = Layer.effect(
  TagRepository,
  makeDbTagRepository,
);
