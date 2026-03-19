import {
  and,
  asc,
  desc,
  count as drizzleCount,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  sql,
} from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { FolderId, NoteId, TagId } from "@/lib/id";
import type { SortOption, TimeFilter } from "@/lib/utils/note-filters";
import type { SelectNote } from "@/server/db/schemas/notes";

import { getStartDateForFilter } from "@/lib/utils/note-filters";
import { Database } from "@/server/db";
import {
  buildFtsMatchQuery,
  getSearchOrderBy,
  getSnippetExpression,
} from "@/server/db/fts-query";
import { folder } from "@/server/db/schemas/folders";
import { note } from "@/server/db/schemas/notes";
import { noteTag, tag } from "@/server/db/schemas/tags";
import { DatabaseError } from "@/server/errors";

export type NoteWithFolder = SelectNote & {
  folderName: null | string;
  snippet: null | string;
};
export type NoteWithSnippet = SelectNote & { snippet: null | string };

export type PinFilter =
  | { excludePinned: true; pinnedOnly?: never }
  | { excludePinned?: false; pinnedOnly?: false }
  | { excludePinned?: never; pinnedOnly: true };

export type NoteFilters = PinFilter & {
  folderId?: FolderId;
  limit?: number;
  query?: string;
  remind?: "overdue" | "upcoming";
  sort?: SortOption;
  tag?: string;
  time?: "all" | TimeFilter;
};

interface CreateNoteInput {
  content: string;
  id: NoteId;
  userId: string;
}

interface UpdateNoteInput {
  content: string;
}

interface UpsertNoteInput {
  content: string;
  createdAt: Date;
  folderId?: FolderId | null;
  id: NoteId;
  pinnedAt: Date | null;
  updatedAt: Date;
  userId: string;
}

interface INoteRepository {
  clearReminder(
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<void, DatabaseError>;
  count(userId: string): Effect.Effect<number, DatabaseError>;
  countOverdueReminders(userId: string): Effect.Effect<number, DatabaseError>;
  create(input: CreateNoteInput): Effect.Effect<void, DatabaseError>;
  createWithTags(
    input: CreateNoteInput,
    tagIds: TagId[],
  ): Effect.Effect<void, DatabaseError>;
  delete(noteId: NoteId, userId: string): Effect.Effect<void, DatabaseError>;
  deleteMany(
    noteIds: NoteId[],
    userId: string,
  ): Effect.Effect<void, DatabaseError>;
  findAllIds(userId: string): Effect.Effect<NoteId[], DatabaseError>;
  findById(
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<SelectNote | undefined, DatabaseError>;
  findDueReminders(userId: string): Effect.Effect<SelectNote[], DatabaseError>;
  findMany(
    userId: string,
    filters: NoteFilters,
  ): Effect.Effect<NoteWithSnippet[], DatabaseError>;
  findManyWithFolder(
    userId: string,
    filters: NoteFilters,
  ): Effect.Effect<NoteWithFolder[], DatabaseError>;
  moveToFolder(
    noteId: NoteId,
    userId: string,
    folderId: FolderId | null,
  ): Effect.Effect<void, DatabaseError>;
  pin(noteId: NoteId, userId: string): Effect.Effect<void, DatabaseError>;
  setReminder(
    noteId: NoteId,
    userId: string,
    remindAt: Date,
  ): Effect.Effect<void, DatabaseError>;
  syncNoteTags(
    noteId: NoteId,
    tagIds: TagId[],
  ): Effect.Effect<void, DatabaseError>;
  unpin(noteId: NoteId, userId: string): Effect.Effect<void, DatabaseError>;
  update(
    noteId: NoteId,
    userId: string,
    input: UpdateNoteInput,
  ): Effect.Effect<void, DatabaseError>;
  updateSyncedAt(
    noteIds: NoteId[],
    userId: string,
  ): Effect.Effect<void, DatabaseError>;
  updateWithTags(
    noteId: NoteId,
    userId: string,
    input: UpdateNoteInput,
    tagIds: TagId[],
  ): Effect.Effect<void, DatabaseError>;
  upsert(input: UpsertNoteInput): Effect.Effect<void, DatabaseError>;
}

export class NoteRepository extends Context.Tag("NoteRepository")<
  NoteRepository,
  INoteRepository
>() {}

const pinnedFirst = asc(
  sql`CASE WHEN ${note.pinnedAt} IS NOT NULL THEN 0 ELSE 1 END`,
);

function buildWhereClause(userId: string, filters: NoteFilters) {
  const baseFilters = [eq(note.userId, userId)];

  const pinnedFilter = filters.excludePinned
    ? [isNull(note.pinnedAt)]
    : filters.pinnedOnly
      ? [isNotNull(note.pinnedAt)]
      : [];

  const timeFilter =
    !filters.time || filters.time === "all"
      ? []
      : [gte(note.createdAt, getStartDateForFilter(filters.time))];

  const remindFilter =
    filters.remind === "overdue"
      ? [isNotNull(note.remindAt), lte(note.remindAt, new Date())]
      : filters.remind === "upcoming"
        ? [isNotNull(note.remindAt), gt(note.remindAt, new Date())]
        : [];

  const folderFilter = filters.folderId
    ? [eq(note.folderId, filters.folderId)]
    : [];

  const matchQuery = buildFtsMatchQuery(filters.query);
  const queryFilter =
    matchQuery === undefined
      ? []
      : [
          sql`note.rowid IN (
          SELECT rowid FROM note_fts WHERE note_fts MATCH ${matchQuery}
        )`,
        ];

  return and(
    ...baseFilters,
    ...pinnedFilter,
    ...queryFilter,
    ...timeFilter,
    ...remindFilter,
    ...folderFilter,
  );
}

function getSortOrder(
  sort: NoteFilters["sort"] = "newest",
  matchQuery?: string,
) {
  if (matchQuery !== undefined) {
    return [pinnedFirst, ...getSearchOrderBy(matchQuery)];
  }

  switch (sort) {
    case "newest": {
      return [pinnedFirst, desc(note.createdAt)];
    }
    case "oldest": {
      return [pinnedFirst, asc(note.createdAt)];
    }
    case "updated": {
      return [pinnedFirst, desc(note.updatedAt)];
    }
    default: {
      return [pinnedFirst, desc(note.createdAt)];
    }
  }
}

function getNoteColumns(snippet: ReturnType<typeof getSnippetExpression>) {
  return {
    content: note.content,
    createdAt: note.createdAt,
    folderId: note.folderId,
    id: note.id,
    pinnedAt: note.pinnedAt,
    remindAt: note.remindAt,
    snippet,
    syncedAt: note.syncedAt,
    updatedAt: note.updatedAt,
    userId: note.userId,
  };
}

function getNoteWithFolderColumns(
  snippet: ReturnType<typeof getSnippetExpression>,
) {
  return {
    ...getNoteColumns(snippet),
    folderName: folder.name,
  };
}

function buildTagWhereClause(
  whereClause: ReturnType<typeof buildWhereClause>,
  tagName: string,
  userId: string,
) {
  return and(whereClause, eq(tag.name, tagName), eq(tag.userId, userId));
}

const makeDbNoteRepository = Effect.gen(function* () {
  const db = yield* Database;

  const clearReminder = (
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .update(note)
          .set({ remindAt: null, updatedAt: new Date() })
          .where(and(eq(note.id, noteId), eq(note.userId, userId)));
      },
    });
  };

  const count = (userId: string): Effect.Effect<number, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const [{ count: notesCount }] = await db
          .select({ count: drizzleCount() })
          .from(note)
          .where(eq(note.userId, userId));

        return notesCount;
      },
    });
  };

  const countOverdueReminders = (
    userId: string,
  ): Effect.Effect<number, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const [{ count: c }] = await db
          .select({ count: drizzleCount() })
          .from(note)
          .where(
            and(
              eq(note.userId, userId),
              isNotNull(note.remindAt),
              lte(note.remindAt, new Date()),
            ),
          );

        return c;
      },
    });
  };

  const create = (
    input: CreateNoteInput,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db.insert(note).values({
          content: input.content,
          createdAt: new Date(),
          id: input.id,
          updatedAt: new Date(),
          userId: input.userId,
        });
      },
    });
  };

  const createWithTags = (
    input: CreateNoteInput,
    tagIds: TagId[],
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db.transaction(async (tx) => {
          await tx.insert(note).values({
            content: input.content,
            createdAt: new Date(),
            id: input.id,
            updatedAt: new Date(),
            userId: input.userId,
          });

          if (tagIds.length > 0) {
            const rows = tagIds.map((tagId) => {
              return { createdAt: new Date(), noteId: input.id, tagId };
            });

            await tx.insert(noteTag).values(rows).onConflictDoNothing();
          }
        });
      },
    });
  };

  const deleteNote = (
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .delete(note)
          .where(and(eq(note.id, noteId), eq(note.userId, userId)));
      },
    });
  };

  const deleteMany = (
    noteIds: NoteId[],
    userId: string,
  ): Effect.Effect<void, DatabaseError> => {
    if (noteIds.length === 0) {
      return Effect.void;
    }

    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .delete(note)
          .where(and(inArray(note.id, noteIds), eq(note.userId, userId)));
      },
    });
  };

  const findAllIds = (
    userId: string,
  ): Effect.Effect<NoteId[], DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const results = await db
          .select({ id: note.id })
          .from(note)
          .where(eq(note.userId, userId));

        return results.map((r) => r.id as NoteId);
      },
    });
  };

  const findById = (
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<SelectNote | undefined, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const results = await db
          .select()
          .from(note)
          .where(and(eq(note.id, noteId), eq(note.userId, userId)))
          .limit(1);

        return results.length > 0 ? results[0] : undefined;
      },
    });
  };

  const findDueReminders = (
    userId: string,
  ): Effect.Effect<SelectNote[], DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .select()
          .from(note)
          .where(
            and(
              eq(note.userId, userId),
              isNotNull(note.remindAt),
              lte(note.remindAt, new Date()),
            ),
          )
          .orderBy(asc(note.remindAt));
      },
    });
  };

  const findMany = (
    userId: string,
    filters: NoteFilters,
  ): Effect.Effect<NoteWithSnippet[], DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const matchQuery = buildFtsMatchQuery(filters.query);
        const snippet = getSnippetExpression(matchQuery);
        const whereClause = buildWhereClause(userId, filters);
        const orderBy = getSortOrder(filters.sort, matchQuery);
        const noteColumns = getNoteColumns(snippet);

        if (filters.tag) {
          const tagName = filters.tag;
          const qb = db
            .selectDistinct({
              ...noteColumns,
            })
            .from(note)
            .innerJoin(noteTag, eq(noteTag.noteId, note.id))
            .innerJoin(tag, eq(tag.id, noteTag.tagId))
            .where(buildTagWhereClause(whereClause, tagName, userId))
            .orderBy(...orderBy);

          if (filters.limit !== undefined) {
            return qb.limit(filters.limit);
          }

          return qb;
        }

        const qb = db
          .select(noteColumns)
          .from(note)
          .where(whereClause)
          .orderBy(...orderBy);

        if (filters.limit !== undefined) {
          return qb.limit(filters.limit);
        }

        return qb;
      },
    });
  };

  const findManyWithFolder = (
    userId: string,
    filters: NoteFilters,
  ): Effect.Effect<NoteWithFolder[], DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const matchQuery = buildFtsMatchQuery(filters.query);
        const snippet = getSnippetExpression(matchQuery);
        const whereClause = buildWhereClause(userId, filters);
        const orderBy = getSortOrder(filters.sort, matchQuery);
        const noteColumns = getNoteWithFolderColumns(snippet);

        if (filters.tag) {
          const tagName = filters.tag;
          const qb = db
            .selectDistinct(noteColumns)
            .from(note)
            .leftJoin(
              folder,
              and(eq(folder.id, note.folderId), eq(folder.userId, userId)),
            )
            .innerJoin(noteTag, eq(noteTag.noteId, note.id))
            .innerJoin(tag, eq(tag.id, noteTag.tagId))
            .where(buildTagWhereClause(whereClause, tagName, userId))
            .orderBy(...orderBy);

          if (filters.limit !== undefined) {
            return qb.limit(filters.limit);
          }

          return qb;
        }

        const qb = db
          .select(noteColumns)
          .from(note)
          .leftJoin(
            folder,
            and(eq(folder.id, note.folderId), eq(folder.userId, userId)),
          )
          .where(whereClause)
          .orderBy(...orderBy);

        if (filters.limit !== undefined) {
          return qb.limit(filters.limit);
        }

        return qb;
      },
    });
  };

  const moveToFolder = (
    noteId: NoteId,
    userId: string,
    folderId: FolderId | null,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .update(note)
          .set({ folderId, updatedAt: new Date() })
          .where(and(eq(note.id, noteId), eq(note.userId, userId)));
      },
    });
  };

  const pin = (
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .update(note)
          .set({ pinnedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(note.id, noteId), eq(note.userId, userId)));
      },
    });
  };

  const setReminder = (
    noteId: NoteId,
    userId: string,
    remindAt: Date,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .update(note)
          .set({ remindAt, updatedAt: new Date() })
          .where(and(eq(note.id, noteId), eq(note.userId, userId)));
      },
    });
  };

  const unpin = (
    noteId: NoteId,
    userId: string,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .update(note)
          .set({ pinnedAt: null, updatedAt: new Date() })
          .where(and(eq(note.id, noteId), eq(note.userId, userId)));
      },
    });
  };

  const update = (
    noteId: NoteId,
    userId: string,
    input: UpdateNoteInput,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .update(note)
          .set({ content: input.content, updatedAt: new Date() })
          .where(and(eq(note.id, noteId), eq(note.userId, userId)));
      },
    });
  };

  const syncNoteTags = (
    noteId: NoteId,
    tagIds: TagId[],
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db.transaction(async (tx) => {
          if (tagIds.length === 0) {
            await tx.delete(noteTag).where(eq(noteTag.noteId, noteId));

            return;
          }

          await tx
            .delete(noteTag)
            .where(
              and(
                eq(noteTag.noteId, noteId),
                notInArray(noteTag.tagId, tagIds),
              ),
            );

          const rows = tagIds.map((tagId) => {
            return { createdAt: new Date(), noteId, tagId };
          });

          await tx.insert(noteTag).values(rows).onConflictDoNothing();
        });
      },
    });
  };

  const updateWithTags = (
    noteId: NoteId,
    userId: string,
    input: UpdateNoteInput,
    tagIds: TagId[],
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db.transaction(async (tx) => {
          await tx
            .update(note)
            .set({ content: input.content, updatedAt: new Date() })
            .where(and(eq(note.id, noteId), eq(note.userId, userId)));

          if (tagIds.length === 0) {
            await tx.delete(noteTag).where(eq(noteTag.noteId, noteId));

            return;
          }

          await tx
            .delete(noteTag)
            .where(
              and(
                eq(noteTag.noteId, noteId),
                notInArray(noteTag.tagId, tagIds),
              ),
            );

          const rows = tagIds.map((tagId) => {
            return { createdAt: new Date(), noteId, tagId };
          });

          await tx.insert(noteTag).values(rows).onConflictDoNothing();
        });
      },
    });
  };

  const updateSyncedAt = (
    noteIds: NoteId[],
    userId: string,
  ): Effect.Effect<void, DatabaseError> => {
    if (noteIds.length === 0) {
      return Effect.void;
    }

    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .update(note)
          .set({ syncedAt: new Date() })
          .where(and(inArray(note.id, noteIds), eq(note.userId, userId)));
      },
    });
  };

  const upsert = (
    input: UpsertNoteInput,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .insert(note)
          .values({
            content: input.content,
            createdAt: input.createdAt,
            folderId: input.folderId ?? null,
            id: input.id,
            pinnedAt: input.pinnedAt,
            updatedAt: input.updatedAt,
            userId: input.userId,
          })
          .onConflictDoUpdate({
            set: {
              content: input.content,
              folderId: input.folderId ?? null,
              pinnedAt: input.pinnedAt,
              updatedAt: input.updatedAt,
            },
            target: note.id,
            where: sql`${note.updatedAt} < ${input.updatedAt.getTime() / 1000}`,
          });
      },
    });
  };

  return {
    clearReminder,
    count,
    countOverdueReminders,
    create,
    createWithTags,
    delete: deleteNote,
    deleteMany,
    findAllIds,
    findById,
    findDueReminders,
    findMany,
    findManyWithFolder,
    moveToFolder,
    pin,
    setReminder,
    syncNoteTags,
    unpin,
    update,
    updateSyncedAt,
    updateWithTags,
    upsert,
  } satisfies INoteRepository;
});

export const NoteRepositoryLive = Layer.effect(
  NoteRepository,
  makeDbNoteRepository,
);
