import {
  and,
  desc,
  count as drizzleCount,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseError } from "@/core/errors";
import type { NoteFilters, NoteMeta } from "@/core/notes";
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
  count: () => Effect.Effect<number, DatabaseError>;
  findByPath: (
    path: string
  ) => Effect.Effect<NoteMeta | undefined, DatabaseError>;
  findMany: (filters: NoteFilters) => Effect.Effect<NoteMeta[], DatabaseError>;
  listFolders: () => Effect.Effect<FolderWithCount[], DatabaseError>;
  listTags: () => Effect.Effect<TagWithCount[], DatabaseError>;
}

type NoteRow = typeof note.$inferSelect & { snippet: null | string };

/** Every read crosses the IPC bridge as a promise; one place turns it typed. */
function dbQuery<T>(query: () => Promise<T>) {
  return Effect.tryPromise({
    catch: (cause) => new DatabaseError({ cause }),
    try: query,
  });
}

const makeDbNoteRepository = Effect.gen(function* () {
  const db = yield* Database;

  const attachTags = Effect.fn("NoteRepository.attachTags")(function* (
    rows: NoteRow[]
  ) {
    if (rows.length === 0) {
      return [];
    }

    // Scoped to the rows in hand: a single-note read has no business
    // pulling the whole tag table across the IPC bridge.
    const paths = rows.map((row) => row.path);

    const tagRows = yield* dbQuery(() =>
      db.select().from(noteTag).where(inArray(noteTag.path, paths))
    );

    const tagsByPath = new Map<string, string[]>();

    for (const row of tagRows) {
      const list = tagsByPath.get(row.path) ?? [];

      list.push(row.tag);
      tagsByPath.set(row.path, list);
    }

    return rows.map(
      (row): NoteMeta => ({
        createdAt: row.createdAt,
        folder: row.folder,
        path: row.path,
        pinned: row.pinned,
        snippet: row.snippet,
        tags: tagsByPath.get(row.path) ?? [],
        title: row.title,
        updatedAt: row.updatedAt,
      })
    );
  });

  const findByPath = Effect.fn("NoteRepository.findByPath")(function* (
    path: string
  ) {
    const rows = yield* dbQuery(() =>
      db
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
        .limit(1)
    );

    const metas = yield* attachTags(rows);

    return metas[0];
  });

  const findMany = Effect.fn("NoteRepository.findMany")(function* (
    filters: NoteFilters
  ) {
    const matchQuery = buildFtsMatchQuery(filters.query);

    const conditions = [
      filters.folder === undefined
        ? undefined
        : eq(note.folder, filters.folder),
      filters.pinnedOnly === true ? eq(note.pinned, true) : undefined,
      filters.tag === undefined ? undefined : getTagFilter(filters.tag),
      matchQuery === undefined ? undefined : getFtsMatchFilter(matchQuery),
    ].filter((condition) => condition !== undefined);

    const orderBy = (() => {
      if (matchQuery !== undefined) {
        return [desc(note.pinned), ...getSearchOrderBy(matchQuery)];
      }

      if (filters.sort === "updated") {
        return [desc(note.updatedAt)];
      }

      return [desc(note.pinned), desc(note.updatedAt)];
    })();

    const rows = yield* dbQuery(() => {
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

      return filters.limit === undefined ? query : query.limit(filters.limit);
    });

    return yield* attachTags(rows);
  });

  return NoteRepository.of({
    count: () =>
      dbQuery(async () => {
        const [row] = await db.select({ value: drizzleCount() }).from(note);

        return row?.value ?? 0;
      }),

    findByPath,

    findMany,

    listFolders: () =>
      dbQuery(async () => {
        const rows = await db
          .select({
            count: drizzleCount(),
            folder: note.folder,
          })
          .from(note)
          .groupBy(note.folder)
          .orderBy(note.folder);

        return rows.filter((row) => row.folder !== "");
      }),

    listTags: () =>
      dbQuery(() =>
        db
          .select({
            count: drizzleCount(),
            tag: noteTag.tag,
          })
          .from(noteTag)
          .groupBy(noteTag.tag)
          .orderBy(noteTag.tag)
      ),
  });
});

export class NoteRepository extends Context.Service<
  NoteRepository,
  INoteRepository
>()("notras/server/NoteRepository") {
  static readonly layer = Layer.effect(NoteRepository, makeDbNoteRepository);
}
