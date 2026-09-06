import { Context, Effect, Layer } from "effect";
import { FileError } from "@/core/errors";
import type { NoteFileContent } from "@/core/file-store";
import { FileStore } from "@/core/file-store";
import {
  composeNote,
  parseNote,
  retitleFrontmatter,
  updateFrontmatter,
} from "@/core/frontmatter";
import type { NoteLink } from "@/core/links";
import type { NoteFilters, NoteMeta } from "@/core/notes";
import {
  filenameFromTitle,
  NOTE_SEGMENT_PATTERN,
  noteFolder,
  notePath,
  noteTitle,
  resolveTitle,
  retitleLeadingHeading,
  suffixedFilename,
} from "@/core/notes";
import { NoteRepository } from "@/server/repositories/note-repository";

interface Note {
  content: string;
  path: string;
  pinned: boolean;
  tags: string[];
  title: string;
  updatedAt: Date;
}

interface INoteService {
  attach: (sourcePath: string) => Effect.Effect<string, FileError>;
  attachImage: (base64Data: string) => Effect.Effect<string, FileError>;
  count: () => Effect.Effect<number>;
  create: (options?: {
    content?: string;
    filename?: string;
    folder?: string;
  }) => Effect.Effect<string, FileError>;
  delete: (path: string) => Effect.Effect<void, FileError>;
  getByPath: (path: string) => Effect.Effect<Note, FileError>;
  list: (filters?: NoteFilters) => Effect.Effect<NoteMeta[]>;
  listFolders: () => Effect.Effect<{ count: number; folder: string }[]>;
  listLinks: () => Effect.Effect<NoteLink[]>;
  listTags: () => Effect.Effect<{ count: number; tag: string }[]>;
  move: (path: string, folder: string) => Effect.Effect<string, FileError>;
  /** Renames the file and syncs a heading or `title:` key the note already has. */
  retitle: (path: string, title: string) => Effect.Effect<string, FileError>;
  setPinned: (path: string, pinned: boolean) => Effect.Effect<void, FileError>;
  setTags: (path: string, tags: string[]) => Effect.Effect<void, FileError>;
  write: (path: string, content: string) => Effect.Effect<Date, FileError>;
}

function toNote(path: string, file: NoteFileContent): Note {
  const parsed = parseNote(file.content);

  return {
    content: file.content,
    path,
    pinned: parsed.frontmatter.pinned,
    tags: parsed.frontmatter.tags,
    title: resolveTitle(path, parsed.body, parsed.frontmatter.title),
    updatedAt: new Date(file.updatedAt),
  };
}

/**
 * Defense in depth: `src/data/` validates user-shaped input with Effect
 * Schema, but the service is the layer everything else calls, and a bad
 * segment here would become a path.
 */
function invalidSegment(segment: string, message: string) {
  return NOTE_SEGMENT_PATTERN.test(segment)
    ? undefined
    : new FileError({ kind: "failed", message });
}

const makeNoteService = Effect.gen(function* () {
  const fileStore = yield* FileStore;
  const noteRepo = yield* NoteRepository;

  const rewriteFrontmatter = Effect.fn("NoteService.rewriteFrontmatter")(
    function* (path: string, patch: Parameters<typeof updateFrontmatter>[1]) {
      const file = yield* fileStore.read(path);
      const next = updateFrontmatter(file.content, patch);

      if (next !== file.content) {
        yield* fileStore.write(path, next);
      }
    }
  );

  const create = Effect.fn("NoteService.create")(function* (options?: {
    content?: string;
    filename?: string;
    folder?: string;
  }) {
    const folder = options?.folder ?? "";
    const baseFilename = options?.filename ?? "untitled";

    const badFilename = invalidSegment(
      baseFilename,
      String.raw`filename cannot contain / \ : or start with a dot`
    );

    if (badFilename !== undefined) {
      return yield* badFilename;
    }

    for (const segment of folder === "" ? [] : folder.split("/")) {
      const badFolder = invalidSegment(
        segment,
        String.raw`folder parts cannot be blank, contain \ or :, or start with a dot`
      );

      if (badFolder !== undefined) {
        return yield* badFolder;
      }
    }

    let filename = baseFilename;
    let counter = 1;

    while (yield* fileStore.exists(notePath(folder, filename))) {
      counter += 1;
      filename = suffixedFilename(baseFilename, counter);
    }

    const path = notePath(folder, filename);

    yield* fileStore.create(path, options?.content ?? "");

    return path;
  });

  const getByPath = Effect.fn("NoteService.getByPath")(function* (
    path: string
  ) {
    const file = yield* fileStore.read(path);

    return toNote(path, file);
  });

  const move = Effect.fn("NoteService.move")(function* (
    path: string,
    folder: string
  ) {
    const target = notePath(folder, noteTitle(path));

    if (target === path) {
      return path;
    }

    if (yield* fileStore.exists(target)) {
      return yield* new FileError({
        kind: "failed",
        message: `a note named ${noteTitle(path)} already exists in ${
          folder === "" ? "the notes root" : folder
        }`,
      });
    }

    yield* fileStore.rename(path, target);

    return target;
  });

  /**
   * Retitle a note: rewrite an existing leading heading and an existing
   * frontmatter `title:`, then rename the file to a slug of the title. Neither
   * a heading nor a key is ever introduced, so a note carrying neither is only
   * renamed.
   *
   * The collision check runs before the write, so the failure a caller can
   * actually provoke leaves the file untouched rather than half-retitled.
   */
  const retitle = Effect.fn("NoteService.retitle")(function* (
    path: string,
    title: string
  ) {
    const filename = filenameFromTitle(title);
    const badFilename = invalidSegment(
      filename,
      String.raw`filename cannot contain / \ : or start with a dot`
    );

    if (badFilename !== undefined) {
      return yield* badFilename;
    }

    const target = notePath(noteFolder(path), filename);
    // A case-only difference is the same file on a case-insensitive filesystem,
    // where `exists(target)` would find the note itself and report a collision
    // against it. Treating it as the same path skips both the error and a rename
    // that would only change the casing.
    const samePath = target.toLowerCase() === path.toLowerCase();

    if (!samePath && (yield* fileStore.exists(target))) {
      return yield* new FileError({
        kind: "failed",
        message: `a note named ${filename} already exists in ${
          noteFolder(path) === "" ? "the notes root" : noteFolder(path)
        }`,
      });
    }

    const file = yield* fileStore.read(path);
    const parsed = parseNote(file.content);
    const next = composeNote(
      parsed.raw && {
        ...parsed.raw,
        lines: retitleFrontmatter(parsed.raw.lines, title),
      },
      retitleLeadingHeading(parsed.body, title)
    );

    if (next !== file.content) {
      yield* fileStore.write(path, next);
    }

    if (samePath) {
      return path;
    }

    yield* fileStore.rename(path, target);

    return target;
  });

  const write = Effect.fn("NoteService.write")(function* (
    path: string,
    content: string
  ) {
    const updatedAt = yield* fileStore.write(path, content);

    return new Date(updatedAt);
  });

  return NoteService.of({
    attach: (sourcePath) => fileStore.attach(sourcePath),

    attachImage: (base64Data) => fileStore.attachImage(base64Data),

    count: () => noteRepo.count().pipe(Effect.orDie),

    create,

    delete: (path) => fileStore.delete(path),

    getByPath,

    list: (filters) => noteRepo.findMany(filters ?? {}).pipe(Effect.orDie),

    listFolders: () => noteRepo.listFolders().pipe(Effect.orDie),

    listLinks: () => noteRepo.listLinks().pipe(Effect.orDie),

    listTags: () => noteRepo.listTags().pipe(Effect.orDie),

    move,

    retitle,

    setPinned: (path, pinned) => rewriteFrontmatter(path, { pinned }),

    setTags: (path, tags) => rewriteFrontmatter(path, { tags }),

    write,
  });
});

export class NoteService extends Context.Service<NoteService, INoteService>()(
  "notras/server/NoteService"
) {
  /** Split out so tests can swap in stub deps; `layer` is what the app uses. */
  static readonly layerNoDeps = Layer.effect(NoteService, makeNoteService);
  static readonly layer = NoteService.layerNoDeps.pipe(
    Layer.provide(NoteRepository.layer)
  );
}
