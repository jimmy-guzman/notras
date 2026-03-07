import { and, eq, notInArray, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { LinkId, NoteId } from "@/lib/id";
import type { SelectLink } from "@/server/db/schemas/links";

import { Database } from "@/server/db";
import { link } from "@/server/db/schemas/links";
import { DatabaseError } from "@/server/errors";

interface UpsertLinkInput {
  description: null | string;
  id: LinkId;
  noteId: NoteId;
  title: null | string;
  url: string;
  userId: string;
}

interface ILinkRepository {
  deleteByNoteIdExcludingUrls(
    noteId: NoteId,
    userId: string,
    keepUrls: string[],
  ): Effect.Effect<void, DatabaseError>;
  findByNoteId(
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<SelectLink[], DatabaseError>;
  upsertMany(inputs: UpsertLinkInput[]): Effect.Effect<void, DatabaseError>;
}

export class LinkRepository extends Context.Tag("LinkRepository")<
  LinkRepository,
  ILinkRepository
>() {}

const makeDbLinkRepository = Effect.gen(function* () {
  const db = yield* Database;

  const deleteByNoteIdExcludingUrls = (
    noteId: NoteId,
    userId: string,
    keepUrls: string[],
  ): Effect.Effect<void, DatabaseError> => {
    if (keepUrls.length === 0) {
      return Effect.tryPromise({
        catch: (cause) => new DatabaseError({ cause }),
        try: () => {
          return db
            .delete(link)
            .where(and(eq(link.noteId, noteId), eq(link.userId, userId)));
        },
      });
    }

    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .delete(link)
          .where(
            and(
              eq(link.noteId, noteId),
              eq(link.userId, userId),
              notInArray(link.url, keepUrls),
            ),
          );
      },
    });
  };

  const findByNoteId = (
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<SelectLink[], DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .select()
          .from(link)
          .where(and(eq(link.noteId, noteId), eq(link.userId, userId)));
      },
    });
  };

  const upsertMany = (
    inputs: UpsertLinkInput[],
  ): Effect.Effect<void, DatabaseError> => {
    if (inputs.length === 0) {
      return Effect.void;
    }

    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .insert(link)
          .values(
            inputs.map((input) => {
              return {
                createdAt: new Date(),
                description: input.description,
                id: input.id,
                noteId: input.noteId,
                title: input.title,
                url: input.url,
                userId: input.userId,
              };
            }),
          )
          .onConflictDoUpdate({
            set: {
              description: sql`excluded.description`,
              title: sql`excluded.title`,
            },
            target: [link.noteId, link.url],
          });
      },
    });
  };

  return {
    deleteByNoteIdExcludingUrls,
    findByNoteId,
    upsertMany,
  } satisfies ILinkRepository;
});

export const LinkRepositoryLive = Layer.effect(
  LinkRepository,
  makeDbLinkRepository,
);
