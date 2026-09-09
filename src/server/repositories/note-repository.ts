import {
  and,
  desc,
  count as drizzleCount,
  eq,
  inArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DatabaseError } from "@/core/errors";
import type { NoteLink } from "@/core/links";
import { resolveNotePath } from "@/core/links";
import type { NoteFilters, NoteMeta } from "@/core/notes";
import { noteTitle } from "@/core/notes";
import { Database } from "@/server/db";
import {
  buildFtsMatchQuery,
  getFtsMatchFilter,
  getSearchOrderBy,
  getSnippetExpression,
  getTagFilter,
} from "@/server/db/fts-query";
import { note, noteLink, noteTag } from "@/server/db/schema";

interface TagWithCount {
  count: number;
  tag: string;
}

interface INoteRepository {
  count: () => Effect.Effect<number, DatabaseError>;
  findByPath: (
    path: string
  ) => Effect.Effect<NoteMeta | undefined, DatabaseError>;
  findDestinations: (
    text: string,
    query: string
  ) => Effect.Effect<NoteLink[], DatabaseError>;
  findIncoming: (
    target: NoteMeta,
    query: string
  ) => Effect.Effect<NoteLink[], DatabaseError>;
  findLinkTargets: (
    links: NoteLink[]
  ) => Effect.Effect<NoteMeta[], DatabaseError>;
  findMany: (filters: NoteFilters) => Effect.Effect<NoteMeta[], DatabaseError>;
  findOutgoing: (path: string) => Effect.Effect<NoteLink[], DatabaseError>;
  listLinks: () => Effect.Effect<NoteLink[], DatabaseError>;
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
    filters: NoteFilters,
    relationship?: SQL
  ) {
    const matchQuery = buildFtsMatchQuery(filters.query);

    const conditions = [
      relationship,
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

    findDestinations: (text, query) => {
      const matchQuery = buildFtsMatchQuery(query);
      return dbQuery(() =>
        db
          .select()
          .from(noteLink)
          .where(
            and(
              sql`instr(notras_lower(${noteLink.target}), notras_lower(${text.toLowerCase()})) > 0`,
              matchQuery === undefined
                ? undefined
                : sql`${noteLink.path} IN (SELECT path FROM note_fts WHERE note_fts MATCH ${matchQuery})`
            )
          )
          .orderBy(noteLink.path, noteLink.line)
      );
    },

    findIncoming: (target, query) => {
      const matchQuery = buildFtsMatchQuery(query);
      const key = sql`notras_link_key(${noteLink.kind}, ${noteLink.target}, ${noteLink.path})`;
      return dbQuery(() =>
        db
          .select()
          .from(noteLink)
          .where(
            and(
              matchQuery === undefined
                ? undefined
                : sql`${noteLink.path} IN (SELECT path FROM note_fts WHERE note_fts MATCH ${matchQuery})`,
              or(
                and(
                  eq(noteLink.kind, "wikilink"),
                  sql`${key} IN (notras_lower(${target.title.toLowerCase()}), notras_lower(${noteTitle(target.path).toLowerCase()}))`
                ),
                and(
                  eq(noteLink.kind, "link"),
                  or(
                    eq(key, sql`notras_lower(${target.path.toLowerCase()})`),
                    sql`${key} IS NULL`
                  )
                )
              )
            )
          )
          .orderBy(noteLink.path, noteLink.line)
      );
    },

    findLinkTargets: (links) => {
      const names = links
        .filter(({ kind }) => kind === "wikilink")
        .map(({ target }) => target.trim().toLowerCase());
      const paths = links
        .filter(({ kind }) => kind === "link")
        .flatMap(({ target, path }) => {
          const joined = resolveNotePath(target, path);
          return joined === undefined ? [] : [joined.toLowerCase()];
        });
      return findMany(
        {},
        or(
          sql`notras_lower(${note.title}) IN (SELECT notras_lower(value) FROM json_each(${JSON.stringify(names)}))`,
          sql`notras_note_name(${note.path}) IN (SELECT notras_lower(value) FROM json_each(${JSON.stringify(names)}))`,
          sql`notras_lower(${note.path}) IN (SELECT notras_lower(value) FROM json_each(${JSON.stringify(paths)}))`
        )
      );
    },

    findMany,

    findOutgoing: (path) =>
      dbQuery(() =>
        db
          .select()
          .from(noteLink)
          .where(
            and(
              eq(noteLink.path, path),
              inArray(noteLink.kind, ["link", "wikilink"])
            )
          )
          .orderBy(noteLink.path, noteLink.line)
      ),

    listLinks: () =>
      dbQuery(() =>
        db
          .select()
          .from(noteLink)
          .where(inArray(noteLink.kind, ["link", "wikilink"]))
          .orderBy(noteLink.path, noteLink.line)
      ),

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
