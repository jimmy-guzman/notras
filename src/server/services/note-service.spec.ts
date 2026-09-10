import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { FileError } from "@/core/errors";
import type { IFileStore } from "@/core/file-store";
import { FileStore } from "@/core/file-store";
import { resolveNotePath } from "@/core/links";
import type { NoteMeta } from "@/core/notes";
import { noteTitle } from "@/core/notes";
import { parseSearch } from "@/core/search";
import { Database, schema } from "@/server/db";
import { NoteRepository } from "@/server/repositories/note-repository";

import { NoteService } from "./note-service";

function notFound(path: string) {
  return Effect.fail(
    new FileError({ kind: "not-found", message: `no such note: ${path}` })
  );
}

/** In-memory notes dir; `writes` records the order of every write. */
function makeFakeFileStore(seed: Record<string, string> = {}) {
  const files = new Map(
    Object.entries(seed).map(([path, content]) => [
      path,
      { content, updatedAt: 1000 },
    ])
  );
  const fileStore: IFileStore = {
    findMentions: () => Effect.succeed([]),
    getNotesDir: () => Effect.succeed("/notes"),
    read: (path) => {
      const file = files.get(path);
      return file === undefined ? notFound(path) : Effect.succeed(file);
    },
    reindexAll: () => Effect.succeed([]),
    setNotesDir: () => Effect.void,
  };
  return { fileStore, files };
}

// The index is Rust-owned and derived; nothing here exercises it.
const emptyRepository = NoteRepository.of({
  count: () => Effect.succeed(0),
  findByPath: () => Effect.succeed(undefined),
  findDestinations: () => Effect.succeed([]),
  findIncoming: () => Effect.succeed([]),
  findLinkTargets: () => Effect.succeed([]),
  findMany: () => Effect.succeed([]),
  findOutgoing: () => Effect.succeed([]),
  listLinks: () => Effect.succeed([]),
  listTags: () => Effect.succeed([]),
});
const stubRepository = Layer.succeed(NoteRepository, emptyRepository);

function makeHarness(seed?: Record<string, string>) {
  const fake = makeFakeFileStore(seed);
  const layer = NoteService.layerNoDeps.pipe(
    Layer.provide(
      Layer.merge(Layer.succeed(FileStore, fake.fileStore), stubRepository)
    )
  );

  return {
    ...fake,
    run: <A, E>(effect: Effect.Effect<A, E, NoteService>) =>
      Effect.runPromise(Effect.provide(effect, layer)),
    runFailure: <A, E>(effect: Effect.Effect<A, E, NoteService>) =>
      Effect.runPromise(Effect.provide(Effect.flip(effect), layer)),
  };
}

describe("noteService.listTags", () => {
  it("should hand back the indexed tags with their counts", async () => {
    const indexed = [
      { count: 8, tag: "idea" },
      { count: 2, tag: "work" },
    ];
    const layer = NoteService.layerNoDeps.pipe(
      Layer.provide(
        Layer.merge(
          Layer.succeed(FileStore, makeFakeFileStore().fileStore),
          Layer.succeed(
            NoteRepository,
            NoteRepository.of({
              count: () => Effect.succeed(0),
              findByPath: () => Effect.succeed(undefined),
              findDestinations: () => Effect.succeed([]),
              findIncoming: () => Effect.succeed([]),
              findLinkTargets: () => Effect.succeed([]),
              findMany: () => Effect.succeed([]),
              findOutgoing: () => Effect.succeed([]),
              listLinks: () => Effect.succeed([]),
              listTags: () => Effect.succeed(indexed),
            })
          )
        )
      )
    );

    const tags = await Effect.runPromise(
      Effect.provide(
        NoteService.use((svc) => svc.listTags()),
        layer
      )
    );

    expect(tags).toStrictEqual(indexed);
  });
});

describe("noteService.getByPath", () => {
  it("should split frontmatter off the returned metadata", async () => {
    const harness = makeHarness({
      "work/notes.md": "---\npinned: true\ntags: [idea]\n---\nbody",
    });

    const note = await harness.run(
      NoteService.use((svc) => svc.getByPath("work/notes.md"))
    );

    expect(note.title).toBe("notes");
    expect(note.pinned).toBe(true);
    expect(note.tags).toStrictEqual(["idea"]);
    expect(note.content).toContain("body");
    expect(note.updatedAt).toStrictEqual(new Date(1000));
  });

  it("should prefer a heading over the filename", async () => {
    const harness = makeHarness({ "agent-note.md": "# from claude\n" });

    const note = await harness.run(
      NoteService.use((svc) => svc.getByPath("agent-note.md"))
    );

    expect(note.title).toBe("from claude");
  });

  it("should prefer the heading over an imported frontmatter title", async () => {
    const harness = makeHarness({
      "agent-note.md": "---\ntitle: effect: a primer\n---\n# from claude\n",
    });

    const note = await harness.run(
      NoteService.use((svc) => svc.getByPath("agent-note.md"))
    );

    expect(note.title).toBe("from claude");
  });
});

describe("noteService.search", () => {
  it("should intersect destinations, folders and tags before capping ranked results", async () => {
    const notes: NoteMeta[] = Array.from({ length: 80 }, (_, index) => ({
      createdAt: new Date(0),
      folder: index < 40 ? "other" : "work/2026",
      path: `${index < 40 ? "other" : "work/2026"}/${index}.md`,
      pinned: index === 40,
      snippet: `ranked context ${index}`,
      tags: ["review"],
      title: `Note ${index}`,
      updatedAt: new Date(0),
    }));
    const repository = Layer.succeed(NoteRepository, {
      ...emptyRepository,
      findDestinations: () =>
        Effect.succeed(
          notes.map(({ path }) => ({
            context: "source link",
            kind: "destination",
            line: 1,
            path,
            target: "https://github.com/notras",
          }))
        ),
      findMany: () => Effect.succeed(notes),
    });
    const layer = NoteService.layerNoDeps.pipe(
      Layer.provide(
        Layer.merge(
          repository,
          Layer.succeed(FileStore, makeFakeFileStore().fileStore)
        )
      )
    );
    const result = await Effect.runPromise(
      NoteService.use((service) =>
        service.search(
          parseSearch("budget folder:work #review link:github.com")
        )
      ).pipe(Effect.provide(layer))
    );
    expect(result).toEqual(notes.slice(40, 70));
  });

  it("should resolve an outgoing source outside the free-text candidates", async () => {
    const target: NoteMeta = {
      createdAt: new Date(0),
      folder: "projects",
      path: "projects/budget.md",
      pinned: false,
      snippet: "budget context",
      tags: [],
      title: "Budget",
      updatedAt: new Date(0),
    };
    const source = { ...target, path: "projects/atlas.md", title: "Atlas" };
    const repository = Layer.succeed(NoteRepository, {
      ...emptyRepository,
      findByPath: () => Effect.succeed(source),
      findLinkTargets: () => Effect.succeed([target]),
      findMany: ({ query }) =>
        Effect.succeed(query ? [target] : [source, target]),
      findOutgoing: () =>
        Effect.succeed([
          {
            context: "see [[Budget]]",
            kind: "wikilink",
            line: 1,
            path: source.path,
            target: "Budget",
          },
        ]),
    });
    const layer = NoteService.layerNoDeps.pipe(
      Layer.provide(
        Layer.merge(
          repository,
          Layer.succeed(FileStore, makeFakeFileStore().fileStore)
        )
      )
    );
    const result = await Effect.runPromise(
      NoteService.use((service) =>
        service.search(parseSearch("budget from:projects/atlas.md"))
      ).pipe(Effect.provide(layer))
    );
    expect(result).toEqual([target]);
  });

  it("should report a failed phrase read instead of returning an empty result", async () => {
    const failure = new FileError({
      kind: "failed",
      message: "could not read saved prose",
    });
    const layer = NoteService.layerNoDeps.pipe(
      Layer.provide(
        Layer.merge(
          stubRepository,
          Layer.succeed(FileStore, {
            ...makeFakeFileStore().fileStore,
            findMentions: () => Effect.fail(failure),
          })
        )
      )
    );
    const result = await Effect.runPromise(
      NoteService.use((service) =>
        service.search(parseSearch('mention:"Ada Lovelace"'))
      ).pipe(Effect.flip, Effect.provide(layer))
    );
    expect(result).toEqual(failure);
  });
});

describe("indexed relationship searches", () => {
  it.each([
    ["needle from:projects/atlas.md link:éxample", ["projects/budget.md"]],
    ["needle to:projects/atlas.md", ["projects/budget.md"]],
    ["to:projects/atlas.md", ["projects/budget.md", "archive/budget.md"]],
    ["from:projects/atlas.md", ["projects/budget.md"]],
    ["link:éxample", ["projects/budget.md"]],
    ["needle link:éxample", ["projects/budget.md"]],
    ["needle from:missing.md", []],
  ])("should preserve resolved results for %s", async (query, paths) => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.function("notras_lower", (value) => String(value).toLowerCase());
    sqlite.function("notras_note_name", (path) =>
      noteTitle(String(path)).toLowerCase()
    );
    sqlite.function("notras_link_key", (kind, target, source) =>
      kind === "wikilink"
        ? String(target).trim().toLowerCase()
        : (resolveNotePath(String(target), String(source))?.toLowerCase() ??
          null)
    );
    sqlite.exec(`
      CREATE TABLE note(path TEXT PRIMARY KEY, title TEXT, folder TEXT, pinned INTEGER, created_at INTEGER, updated_at INTEGER);
      CREATE TABLE note_tag(path TEXT, tag TEXT);
      CREATE TABLE note_link(path TEXT, line INTEGER, kind TEXT, target TEXT, context TEXT);
      CREATE VIRTUAL TABLE note_fts USING fts5(path UNINDEXED, title, content);
      INSERT INTO note VALUES ('projects/atlas.md', 'Atlas', 'projects', 0, 0, 0), ('projects/budget.md', 'Budget', 'projects', 0, 0, 0), ('archive/budget.md', 'Budget', 'archive', 0, 0, 0);
      INSERT INTO note_fts VALUES ('projects/atlas.md', 'Atlas', ''), ('projects/budget.md', 'Budget', 'needle'), ('archive/budget.md', 'Budget', '');
      INSERT INTO note_link VALUES ('projects/atlas.md', 1, 'wikilink', 'Budget', 'outgoing context'), ('projects/budget.md', 1, 'wikilink', 'Atlas', 'incoming context'), ('projects/budget.md', 2, 'destination', 'https://Éxample.com', 'external context'), ('archive/budget.md', 1, 'wikilink', 'Atlas', 'archived context');
      WITH RECURSIVE noise(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM noise WHERE i < 100)
      INSERT INTO note SELECT 'noise/' || i || '.md', 'Unrelated ' || i, 'noise', 0, 0, 0 FROM noise;
      INSERT INTO note_fts SELECT path, title, '' FROM note WHERE folder = 'noise';
      INSERT INTO note_link SELECT path, 1, 'wikilink', 'Unrelated 1', 'irrelevant context' FROM note WHERE folder = 'noise';
    `);
    const reads: { count: number; sql: string }[] = [];
    const db = drizzle(
      (sql, params) => {
        const rows = sqlite
          .prepare(sql)
          .all(...params)
          .map((row) => Object.values(row));
        reads.push({ count: rows.length, sql });
        return Promise.resolve({ rows });
      },
      { schema }
    );
    const repository = NoteRepository.layer.pipe(
      Layer.provide(Layer.succeed(Database, db))
    );
    const layer = NoteService.layerNoDeps.pipe(
      Layer.provide(
        Layer.merge(
          repository,
          Layer.succeed(FileStore, makeFakeFileStore().fileStore)
        )
      )
    );
    try {
      const result = await Effect.runPromise(
        NoteService.use((service) =>
          service.search(parseSearch(String(query)))
        ).pipe(Effect.provide(layer))
      );
      expect(result.map(({ path }) => path)).toEqual(paths);
      expect(
        reads
          .filter(({ sql }) => sql.includes('from "note_link"'))
          .every(({ count }) => count < 10)
      ).toBe(true);
      if (String(query).startsWith("needle")) {
        expect(
          reads
            .filter(({ sql }) => sql.includes('from "note"'))
            .every(({ count }) => count < 10)
        ).toBe(true);
      }
    } finally {
      sqlite.close();
    }
  });
});
