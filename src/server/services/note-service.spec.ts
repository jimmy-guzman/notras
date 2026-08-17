import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import type { IFileStore, NoteFileContent } from "@/core";

import { FileError, FileStore } from "@/core";
import { NoteRepository } from "@/server/repositories/note-repository";

import { NoteService } from "./note-service";

interface Written {
  content: string;
  path: string;
}

function notFound(path: string) {
  return Effect.fail(new FileError({ message: `no such note: ${path}` }));
}

/** In-memory notes dir; `writes` records the order of every write. */
function makeFakeFileStore(seed: Record<string, string> = {}) {
  const files = new Map<string, NoteFileContent>(
    Object.entries(seed).map(([path, content]) => {
      return [path, { content, updatedAt: 1000 }];
    }),
  );
  const writes: Written[] = [];

  const fileStore: IFileStore = {
    attach: () => {
      return Effect.succeed("attachments/file.png");
    },
    attachImage: () => {
      return Effect.succeed("attachments/pasted.png");
    },
    delete: (path) => {
      files.delete(path);

      return Effect.void;
    },
    exists: (path) => {
      return Effect.succeed(files.has(path));
    },
    getNotesDir: () => {
      return Effect.succeed("/notes");
    },
    read: (path) => {
      const file = files.get(path);

      return file === undefined ? notFound(path) : Effect.succeed(file);
    },
    readExternal: (path) => {
      return notFound(path);
    },
    reindexAll: () => {
      return Effect.succeed([]);
    },
    rename: (from, to) => {
      const file = files.get(from);

      if (file === undefined) {
        return notFound(from);
      }

      files.delete(from);
      files.set(to, file);

      return Effect.void;
    },
    setNotesDir: () => {
      return Effect.void;
    },
    write: (path, content) => {
      writes.push({ content, path });
      files.set(path, { content, updatedAt: 2000 });

      return Effect.succeed(2000);
    },
    writeExternal: () => {
      return Effect.succeed(2000);
    },
  };

  return { fileStore, files, writes };
}

// The index is Rust-owned and derived; nothing here exercises it.
const stubRepository = Layer.succeed(
  NoteRepository,
  NoteRepository.of({
    count: () => {
      return Effect.succeed(0);
    },
    findByPath: () => {
      return Effect.succeed(undefined);
    },
    findMany: () => {
      return Effect.succeed([]);
    },
    listFolders: () => {
      return Effect.succeed([]);
    },
    listTags: () => {
      return Effect.succeed([]);
    },
  }),
);

function makeHarness(seed?: Record<string, string>) {
  const fake = makeFakeFileStore(seed);
  const layer = NoteService.layerNoDeps.pipe(
    Layer.provide(
      Layer.merge(Layer.succeed(FileStore, fake.fileStore), stubRepository),
    ),
  );

  return {
    ...fake,
    run: <A, E>(effect: Effect.Effect<A, E, NoteService>) => {
      return Effect.runPromise(Effect.provide(effect, layer));
    },
    runFailure: <A, E>(effect: Effect.Effect<A, E, NoteService>) => {
      return Effect.runPromise(Effect.provide(Effect.flip(effect), layer));
    },
  };
}

describe("noteService.create", () => {
  it("should write the note at folder/filename.md", async () => {
    const harness = makeHarness();

    const path = await harness.run(
      NoteService.use((svc) => {
        return svc.create({ content: "hi", filename: "notes", folder: "work" });
      }),
    );

    expect(path).toBe("work/notes.md");
    expect(harness.writes).toStrictEqual([
      { content: "hi", path: "work/notes.md" },
    ]);
  });

  it("should suffix the filename until the path is free", async () => {
    const harness = makeHarness({
      "untitled-2.md": "taken",
      "untitled.md": "taken",
    });

    const path = await harness.run(
      NoteService.use((svc) => {
        return svc.create();
      }),
    );

    expect(path).toBe("untitled-3.md");
  });

  it.each([["a/b"], [String.raw`a\b`], ["a:b"], [".hidden"]])(
    "should reject the filename %s",
    async (filename) => {
      const harness = makeHarness();

      const error = await harness.runFailure(
        NoteService.use((svc) => {
          return svc.create({ filename });
        }),
      );

      expect(error).toBeInstanceOf(FileError);
      expect(error.message).toBe(
        String.raw`filename cannot contain / \ : or start with a dot`,
      );
      expect(harness.writes).toStrictEqual([]);
    },
  );

  it("should reject a bad folder segment", async () => {
    const harness = makeHarness();

    const error = await harness.runFailure(
      NoteService.use((svc) => {
        return svc.create({ folder: "work/.hidden" });
      }),
    );

    expect(error.message).toBe(
      String.raw`folder cannot contain / \ : or start with a dot`,
    );
  });
});

describe("noteService.move", () => {
  it("should be a no-op when the note is already in the folder", async () => {
    const harness = makeHarness({ "work/notes.md": "body" });

    const path = await harness.run(
      NoteService.use((svc) => {
        return svc.move("work/notes.md", "work");
      }),
    );

    expect(path).toBe("work/notes.md");
    expect(harness.files.has("work/notes.md")).toBe(true);
  });

  it("should fail when a note of the same title is already there", async () => {
    const harness = makeHarness({
      "notes.md": "source",
      "work/notes.md": "occupied",
    });

    const error = await harness.runFailure(
      NoteService.use((svc) => {
        return svc.move("notes.md", "work");
      }),
    );

    expect(error.message).toBe("a note named notes already exists in work");
    expect(harness.files.get("work/notes.md")?.content).toBe("occupied");
  });

  it("should name the notes root when moving to the top level", async () => {
    const harness = makeHarness({
      "notes.md": "occupied",
      "work/notes.md": "source",
    });

    const error = await harness.runFailure(
      NoteService.use((svc) => {
        return svc.move("work/notes.md", "");
      }),
    );

    expect(error.message).toBe(
      "a note named notes already exists in the notes root",
    );
  });
});

describe("noteService.retitle", () => {
  it("should keep the note in its folder", async () => {
    const harness = makeHarness({ "work/old.md": "body" });

    const path = await harness.run(
      NoteService.use((svc) => {
        return svc.retitle("work/old.md", "new");
      }),
    );

    expect(path).toBe("work/new.md");
    expect(harness.files.has("work/new.md")).toBe(true);
    expect(harness.files.has("work/old.md")).toBe(false);
  });

  it("should slug a title the filesystem could not take", async () => {
    const harness = makeHarness({ "old.md": "# old" });

    const path = await harness.run(
      NoteService.use((svc) => {
        return svc.retitle("old.md", "Effect: A Primer");
      }),
    );

    expect(path).toBe("effect-a-primer.md");
    expect(harness.files.get("effect-a-primer.md")?.content).toBe(
      "# Effect: A Primer",
    );
  });

  // The property the feature rests on: a note with somewhere to keep a title
  // gets the title back verbatim, colon and all.
  it.each([
    ["a heading", "# old title\n\nbody\n"],
    ["a frontmatter title", "---\ntitle: old title\n---\nbody\n"],
    ["both", "---\ntitle: old\n---\n# older\n"],
  ])("should round-trip a title through %s", async (_label, content) => {
    const harness = makeHarness({ "note.md": content });

    const path = await harness.run(
      NoteService.use((svc) => {
        return svc.retitle("note.md", "effect: a primer");
      }),
    );

    const note = await harness.run(
      NoteService.use((svc) => {
        return svc.getByPath(path);
      }),
    );

    expect(note.title).toBe("effect: a primer");
  });

  /**
   * The visible cost of never inventing: a note with neither a heading nor a
   * key has nowhere to keep a title, so it falls back to the filename and the
   * slug is what the user sees.
   */
  it("should fall back to the slug when there is nowhere to keep a title", async () => {
    const harness = makeHarness({ "old.md": "just prose\n" });

    const path = await harness.run(
      NoteService.use((svc) => {
        return svc.retitle("old.md", "Effect: A Primer");
      }),
    );

    const note = await harness.run(
      NoteService.use((svc) => {
        return svc.getByPath(path);
      }),
    );

    expect(path).toBe("effect-a-primer.md");
    expect(harness.files.get(path)?.content).toBe("just prose\n");
    expect(note.title).toBe("effect-a-primer");
  });

  it("should leave a deeper heading alone", async () => {
    const harness = makeHarness({ "old.md": "## section\n\nbody\n" });

    await harness.run(
      NoteService.use((svc) => {
        return svc.retitle("old.md", "new");
      }),
    );

    expect(harness.files.get("new.md")?.content).toBe("## section\n\nbody\n");
  });

  it("should reject a collision before writing anything", async () => {
    const harness = makeHarness({
      "taken.md": "other",
      "work.md": "# work",
    });

    const error = await harness.runFailure(
      NoteService.use((svc) => {
        return svc.retitle("work.md", "taken");
      }),
    );

    expect(error).toBeInstanceOf(FileError);
    expect(error.message).toBe(
      "a note named taken already exists in the notes root",
    );
    // The heading must not be left pointing at a name the note never got.
    expect(harness.files.get("work.md")?.content).toBe("# work");
    expect(harness.files.get("taken.md")?.content).toBe("other");
  });

  /**
   * `filenameFromTitle` lowercases, so a note whose file carries uppercase would
   * otherwise collide with itself: `exists("foo.md")` finds `Foo.md` on a
   * case-insensitive filesystem.
   */
  it("should not treat a case-only difference as a collision", async () => {
    const harness = makeHarness({ "Foo.md": "# old" });

    const path = await harness.run(
      NoteService.use((svc) => {
        return svc.retitle("Foo.md", "Foo");
      }),
    );

    expect(path).toBe("Foo.md");
    expect(harness.files.get("Foo.md")?.content).toBe("# Foo");
    expect(harness.files.has("foo.md")).toBe(false);
  });

  it("should not write when the title already matches", async () => {
    const harness = makeHarness({ "same.md": "# same" });

    const path = await harness.run(
      NoteService.use((svc) => {
        return svc.retitle("same.md", "same");
      }),
    );

    expect(path).toBe("same.md");
    expect(harness.writes).toStrictEqual([]);
  });
});

describe("noteService frontmatter", () => {
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    harness = makeHarness({ "notes.md": "---\npinned: true\n---\nbody" });
  });

  it("should not write when the frontmatter is unchanged", async () => {
    await harness.run(
      NoteService.use((svc) => {
        return svc.setPinned("notes.md", true);
      }),
    );

    expect(harness.writes).toStrictEqual([]);
  });

  it("should drop the block when the last own key is removed", async () => {
    await harness.run(
      NoteService.use((svc) => {
        return svc.setPinned("notes.md", false);
      }),
    );

    expect(harness.writes).toStrictEqual([
      { content: "body", path: "notes.md" },
    ]);
  });

  it("should preserve unknown keys when setting tags", async () => {
    const own = makeHarness({ "notes.md": "---\nauthor: jimmy\n---\nbody" });

    await own.run(
      NoteService.use((svc) => {
        return svc.setTags("notes.md", ["idea"]);
      }),
    );

    expect(own.writes[0]?.content).toContain("author: jimmy");
    expect(own.writes[0]?.content).toContain("idea");
  });
});

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
              count: () => {
                return Effect.succeed(0);
              },
              findByPath: () => {
                return Effect.succeed(undefined);
              },
              findMany: () => {
                return Effect.succeed([]);
              },
              listFolders: () => {
                return Effect.succeed([]);
              },
              listTags: () => {
                return Effect.succeed(indexed);
              },
            }),
          ),
        ),
      ),
    );

    const tags = await Effect.runPromise(
      Effect.provide(
        NoteService.use((svc) => {
          return svc.listTags();
        }),
        layer,
      ),
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
      NoteService.use((svc) => {
        return svc.getByPath("work/notes.md");
      }),
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
      NoteService.use((svc) => {
        return svc.getByPath("agent-note.md");
      }),
    );

    expect(note.title).toBe("from claude");
  });

  it("should prefer a frontmatter title over a heading", async () => {
    const harness = makeHarness({
      "agent-note.md": "---\ntitle: effect: a primer\n---\n# from claude\n",
    });

    const note = await harness.run(
      NoteService.use((svc) => {
        return svc.getByPath("agent-note.md");
      }),
    );

    expect(note.title).toBe("effect: a primer");
  });
});
