import {
  and,
  desc,
  count as drizzleCount,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { NoteFilters, NoteMeta } from "@/core";

import { DatabaseError } from "@/core";
import { Database } from "@/server/db";
import {
  buildFtsMatchQuery,
  getFtsMatchFilter,
  getSearchOrderBy,
  getSnippetExpression,
  getTagFilter,
} from "@/server/db/fts-query";
import { note, noteTag } from "@/server/db/schema";

interface TagWithCount {
  count: number;
  tag: string;
}

interface FolderWithCount {
  count: number;
  folder: string;
}

interface INoteRepository {
  count(): Effect.Effect<number, DatabaseError>;
  findByPath(path: string): Effect.Effect<NoteMeta | undefined, DatabaseError>;
  findMany(filters: NoteFilters): Effect.Effect<NoteMeta[], DatabaseError>;
  listFolders(): Effect.Effect<FolderWithCount[], DatabaseError>;
  listTags(): Effect.Effect<TagWithCount[], DatabaseError>;
}

export class NoteRepository extends Context.Tag("NoteRepository")<
  NoteRepository,
  INoteRepository
>() {}

type NoteRow = typeof note.$inferSelect & { snippet: null | string };

const makeDbNoteRepository = Effect.gen(function* () {
  const db = yield* Database;

  const attachTags = (rows: NoteRow[]) => {
    return Effect.gen(function* () {
      if (rows.length === 0) {
        return [];
      }

      // Scoped to the rows in hand: a single-note read has no business
      // pulling the whole tag table across the IPC bridge.
      const paths = rows.map((row) => {
        return row.path;
      });

      const tagRows = yield* Effect.tryPromise({
        catch: (cause) => {
          return new DatabaseError({ cause });
        },
        try: () => {
          return db.select().from(noteTag).where(inArray(noteTag.path, paths));
        },
      });

      const tagsByPath = new Map<string, string[]>();

      for (const row of tagRows) {
        const list = tagsByPath.get(row.path) ?? [];

        list.push(row.tag);
        tagsByPath.set(row.path, list);
      }

      return rows.map((row): NoteMeta => {
        return {
          createdAt: row.createdAt,
          folder: row.folder,
          path: row.path,
          pinned: row.pinned,
          snippet: row.snippet,
          tags: tagsByPath.get(row.path) ?? [],
          title: row.title,
          updatedAt: row.updatedAt,
        };
      });
    });
  };

  const repository: INoteRepository = {
    count: () => {
      return Effect.tryPromise({
        catch: (cause) => {
          return new DatabaseError({ cause });
        },
        try: async () => {
          const [row] = await db.select({ value: drizzleCount() }).from(note);

          return row?.value ?? 0;
        },
      });
    },

    findByPath: (path) => {
      return Effect.gen(function* () {
        const rows = yield* Effect.tryPromise({
          catch: (cause) => {
            return new DatabaseError({ cause });
          },
          try: () => {
            return db
              .select({
                createdAt: note.createdAt,
                folder: note.folder,
                path: note.path,
                pinned: note.pinned,
                snippet: sql<null>`NULL`,
                title: note.title,
                updatedAt: note.updatedAt,
              })
              .from(note)
              .where(eq(note.path, path))
              .limit(1);
          },
        });

        const metas = yield* attachTags(rows);

        return metas[0];
      });
    },

    findMany: (filters) => {
      return Effect.gen(function* () {
        const matchQuery = buildFtsMatchQuery(filters.query);

        const conditions = [
          filters.folder === undefined
            ? undefined
            : eq(note.folder, filters.folder),
          filters.pinnedOnly === true ? eq(note.pinned, true) : undefined,
          filters.tag === undefined ? undefined : getTagFilter(filters.tag),
          matchQuery === undefined ? undefined : getFtsMatchFilter(matchQuery),
        ].filter((condition) => {
          return condition !== undefined;
        });

        const orderBy = (() => {
          if (matchQuery !== undefined) {
            return [desc(note.pinned), ...getSearchOrderBy(matchQuery)];
          }

          if (filters.sort === "updated") {
            return [desc(note.updatedAt)];
          }

          return [desc(note.pinned), desc(note.updatedAt)];
        })();

        const rows = yield* Effect.tryPromise({
          catch: (cause) => {
            return new DatabaseError({ cause });
          },
          try: () => {
            const query = db
              .select({
                createdAt: note.createdAt,
                folder: note.folder,
                path: note.path,
                pinned: note.pinned,
                snippet: getSnippetExpression(matchQuery),
                title: note.title,
                updatedAt: note.updatedAt,
              })
              .from(note)
              .where(conditions.length > 0 ? and(...conditions) : undefined)
              .orderBy(...orderBy);

            return filters.limit === undefined
              ? query
              : query.limit(filters.limit);
          },
        });

        return yield* attachTags(rows);
      });
    },

    listFolders: () => {
      return Effect.tryPromise({
        catch: (cause) => {
          return new DatabaseError({ cause });
        },
        try: async () => {
          const rows = await db
            .select({
              count: drizzleCount(),
              folder: note.folder,
            })
            .from(note)
            .groupBy(note.folder)
            .orderBy(note.folder);

          return rows.filter((row) => {
            return row.folder !== "";
          });
        },
      });
    },

    listTags: () => {
      return Effect.tryPromise({
        catch: (cause) => {
          return new DatabaseError({ cause });
        },
        try: () => {
          return db
            .select({
              count: drizzleCount(),
              tag: noteTag.tag,
            })
            .from(noteTag)
            .groupBy(noteTag.tag)
            .orderBy(noteTag.tag);
        },
      });
    },
  };

  return repository;
});

export const NoteRepositoryLive = Layer.effect(
  NoteRepository,
  makeDbNoteRepository,
);
