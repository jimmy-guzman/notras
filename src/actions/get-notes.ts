import { Effect } from "effect";
import { cacheTag } from "next/cache";
import { createLoader } from "nuqs/server";

import type { NoteId } from "@/lib/id";
import type { NoteSearchParams } from "@/lib/notes-search-params";
import type {
  NoteWithFolder,
  PinFilter,
} from "@/server/repositories/note-repository";

import { toFolderId } from "@/lib/id";
import { parsers } from "@/lib/notes-search-params";
import { AppRuntime } from "@/server/layer";
import { FOLDER_ID_PATTERN } from "@/server/schemas/folder-schemas";
import { NoteService } from "@/server/services/note-service";
import { TagService } from "@/server/services/tag-service";
import { UserService } from "@/server/services/user-service";

export const loadSearchParams = createLoader(parsers);

async function fetchNotes(
  searchParams: NoteSearchParams,
  options?: PinFilter & { limit?: number },
) {
  const { folder, q: query, sort, tag, time } = searchParams;
  const folderId =
    folder && FOLDER_ID_PATTERN.test(folder) ? toFolderId(folder) : undefined;

  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const userId = yield* UserService.pipe(
        Effect.flatMap((svc) => svc.getDeviceUserId()),
      );

      return yield* NoteService.pipe(
        Effect.flatMap((svc) => {
          return svc.list(userId, {
            ...options,
            folderId,
            query,
            sort,
            tag,
            time,
          });
        }),
      );
    }),
  );
}

async function fetchNotesCached(
  searchParams: NoteSearchParams,
  options?: PinFilter & { limit?: number },
) {
  "use cache";

  cacheTag("notes");

  return fetchNotes(searchParams, options);
}

export async function getNotes(
  searchParams: NoteSearchParams,
  options?: PinFilter & { limit?: number },
) {
  if (searchParams.time !== "all") {
    return fetchNotes(searchParams, options);
  }

  return fetchNotesCached(searchParams, options);
}

export async function getNotesCount() {
  "use cache";

  cacheTag("notes");

  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const userId = yield* UserService.pipe(
        Effect.flatMap((svc) => svc.getDeviceUserId()),
      );

      return yield* NoteService.pipe(
        Effect.flatMap((svc) => svc.count(userId)),
      );
    }),
  );
}

export async function getTagsForNotes(noteIds: NoteId[]) {
  "use cache";

  cacheTag("notes", "tags");

  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const userId = yield* UserService.pipe(
        Effect.flatMap((svc) => svc.getDeviceUserId()),
      );

      return yield* TagService.pipe(
        Effect.flatMap((svc) => svc.getTagsForNotes(userId, noteIds)),
      );
    }),
  );
}

async function fetchNotesWithFolder(
  searchParams: NoteSearchParams,
  options?: PinFilter,
): Promise<NoteWithFolder[]> {
  const { folder, q: query, sort, tag, time } = searchParams;
  const folderId =
    folder && FOLDER_ID_PATTERN.test(folder) ? toFolderId(folder) : undefined;

  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const userId = yield* UserService.pipe(
        Effect.flatMap((svc) => svc.getDeviceUserId()),
      );

      return yield* NoteService.pipe(
        Effect.flatMap((svc) => {
          return svc.listWithFolder(userId, {
            ...options,
            folderId,
            query,
            sort,
            tag,
            time,
          });
        }),
      );
    }),
  );
}

async function fetchNotesWithFolderCached(
  searchParams: NoteSearchParams,
  options?: PinFilter,
): Promise<NoteWithFolder[]> {
  "use cache";

  cacheTag("notes", "folders");

  return fetchNotesWithFolder(searchParams, options);
}

export async function getNotesWithFolder(
  searchParams: NoteSearchParams,
  options?: PinFilter,
): Promise<NoteWithFolder[]> {
  if (searchParams.time !== "all") {
    return fetchNotesWithFolder(searchParams, options);
  }

  return fetchNotesWithFolderCached(searchParams, options);
}
