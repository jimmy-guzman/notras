import { Context, Effect, Layer } from "effect";
import { updateTag } from "next/cache";

import type { NoteId } from "@/lib/id";
import type { SelectLink } from "@/server/db/schemas/links";

import { generateLinkId } from "@/lib/id";
import {
  LinkRepository,
  LinkRepositoryLive,
} from "@/server/repositories/link-repository";
import { OgService, OgServiceLive } from "@/server/services/og-service";

const URL_PATTERN =
  /\[[^\]]*\]\((https?:\/\/\S+)\)|(?<![[()"])(https?:\/\/[^\s)>\]"]+)/g;

function cleanUrl(raw: string) {
  const trimmed = raw.replaceAll(/[.,!?;:'"]+$/g, "");

  const open = (trimmed.match(/\(/g) ?? []).length;
  const close = (trimmed.match(/\)/g) ?? []).length;
  const excess = close - open;

  return excess > 0 ? trimmed.slice(0, -excess) : trimmed;
}

export function extractUrls(content: string): string[] {
  const urls = new Set<string>();

  for (const match of content.matchAll(URL_PATTERN)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- capture groups are string | undefined at runtime
    const url = match[1] ?? match[2];

    if (url) {
      urls.add(cleanUrl(url));
    }
  }

  return [...urls];
}

interface ILinkService {
  getByNoteId(userId: string, noteId: NoteId): Effect.Effect<SelectLink[]>;
  syncLinks(
    userId: string,
    noteId: NoteId,
    content: string,
  ): Effect.Effect<void>;
}

export class LinkService extends Context.Tag("LinkService")<
  LinkService,
  ILinkService
>() {}

const makeLinkService = Effect.gen(function* () {
  const linkRepo = yield* LinkRepository;
  const ogService = yield* OgService;

  const getByNoteId = (
    userId: string,
    noteId: NoteId,
  ): Effect.Effect<SelectLink[]> => {
    return linkRepo.findByNoteId(noteId, userId).pipe(Effect.orDie);
  };

  const syncLinks = (
    userId: string,
    noteId: NoteId,
    content: string,
  ): Effect.Effect<void> => {
    return Effect.gen(function* () {
      const urls = extractUrls(content);

      yield* linkRepo
        .deleteByNoteIdExcludingUrls(noteId, userId, urls)
        .pipe(Effect.orDie);

      if (urls.length === 0) {
        return;
      }

      const existing = yield* linkRepo
        .findByNoteId(noteId, userId)
        .pipe(Effect.orDie);
      const existingByUrl = new Map(existing.map((l) => [l.url, l]));
      const newUrls = urls.filter((url) => !existingByUrl.has(url));

      if (newUrls.length === 0) {
        return;
      }

      const inputs = yield* Effect.all(
        newUrls.map((url) => {
          return Effect.gen(function* () {
            const metadata = yield* ogService.fetchOgMetadata(url);

            return {
              description: metadata.description,
              id: generateLinkId(),
              noteId,
              title: metadata.title,
              url,
              userId,
            };
          });
        }),
      );

      yield* linkRepo.upsertMany(inputs).pipe(Effect.orDie);
      updateTag("notes");
    });
  };

  return {
    getByNoteId,
    syncLinks,
  } satisfies ILinkService;
});

export const LinkServiceLive = Layer.effect(LinkService, makeLinkService).pipe(
  Layer.provide(Layer.merge(LinkRepositoryLive, OgServiceLive)),
);
