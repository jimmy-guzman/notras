import { Context, Effect, Layer } from "effect";
import type { FileError } from "@/core/errors";
import type { NoteFileContent } from "@/core/file-store";
import { FileStore } from "@/core/file-store";
import { parseNote } from "@/core/frontmatter";
import type { BareMention, NoteLink } from "@/core/links";
import type { NoteFilters, NoteMeta } from "@/core/notes";
import { resolveTitle } from "@/core/notes";
import {
  filterSearchNotes,
  type NoteSearch,
  searchFilterMatches,
} from "@/core/search";
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
  count: () => Effect.Effect<number>;
  findMentions: (
    path: string,
    title: string
  ) => Effect.Effect<BareMention[], FileError>;
  getByPath: (path: string) => Effect.Effect<Note, FileError>;
  list: (filters?: NoteFilters) => Effect.Effect<NoteMeta[]>;
  listLinks: () => Effect.Effect<NoteLink[]>;
  listTags: () => Effect.Effect<{ count: number; tag: string }[]>;
  search: (search: NoteSearch) => Effect.Effect<NoteMeta[], FileError>;
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

const makeNoteService = Effect.gen(function* () {
  const fileStore = yield* FileStore;
  const noteRepo = yield* NoteRepository;

  const getByPath = Effect.fn("NoteService.getByPath")(function* (
    path: string
  ) {
    const file = yield* fileStore.read(path);

    return toNote(path, file);
  });

  return NoteService.of({
    count: () => noteRepo.count().pipe(Effect.orDie),

    findMentions: (path, title) => fileStore.findMentions(path, title),

    getByPath,

    list: (filters) => noteRepo.findMany(filters ?? {}).pipe(Effect.orDie),

    listLinks: () => noteRepo.listLinks().pipe(Effect.orDie),

    listTags: () => noteRepo.listTags().pipe(Effect.orDie),

    search: Effect.fn("NoteService.search")(function* (search: NoteSearch) {
      if (search.incomplete) {
        return [];
      }
      const candidates = yield* noteRepo
        .findMany({ query: search.query })
        .pipe(Effect.orDie);
      const matches = yield* Effect.forEach(
        search.filters,
        Effect.fn("NoteService.searchFilter")(function* (filter) {
          if (filter.kind === "mention") {
            const bare = yield* fileStore.findMentions(undefined, filter.value);
            return searchFilterMatches(filter, candidates, [], bare);
          }
          if (filter.kind === "folder" || filter.kind === "tag") {
            return searchFilterMatches(filter, candidates, [], []);
          }
          if (filter.kind === "link") {
            const links = yield* noteRepo
              .findDestinations(filter.value, search.query)
              .pipe(Effect.orDie);
            return searchFilterMatches(filter, candidates, links, []);
          }
          const target = yield* noteRepo
            .findByPath(filter.value)
            .pipe(Effect.orDie);
          if (target === undefined) {
            return new Map<string, string | null>();
          }
          const links = yield* (
            filter.kind === "to"
              ? noteRepo.findIncoming(target, search.query)
              : noteRepo.findOutgoing(target.path)
          ).pipe(Effect.orDie);
          const targets = yield* noteRepo
            .findLinkTargets(links)
            .pipe(Effect.orDie);
          // Resolver candidates retain repository order for path case ties.
          const notes = [
            ...new Map(
              [...targets, ...candidates, target].map((note) => [
                note.path,
                note,
              ])
            ).values(),
          ];
          const bare =
            filter.kind === "to"
              ? yield* fileStore.findMentions(target.path, target.title)
              : [];
          return searchFilterMatches(filter, notes, links, bare);
        })
      );
      const matched = candidates
        .filter(({ path }) => matches.every((match) => match.has(path)))
        .map((note) => ({
          ...note,
          snippet:
            note.snippet ??
            matches
              .map((match) => match.get(note.path))
              .find((context) => context !== null && context !== undefined) ??
            null,
        }));
      return filterSearchNotes(matched, search);
    }),
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
