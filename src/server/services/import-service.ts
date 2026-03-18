import { TextDecoder } from "node:util";

import { Context, Effect, Either, Layer, Schema } from "effect";
import { unzipSync } from "fflate";

import type { FolderId, NoteId } from "@/lib/id";
import type { CreateAssetInput } from "@/server/repositories/asset-repository";
import type { ExportedNote, ImportMode } from "@/server/schemas/export-schemas";

import { toAssetId, toFolderId, toNoteId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import {
  AssetRepository,
  AssetRepositoryLive,
} from "@/server/repositories/asset-repository";
import {
  FolderRepository,
  FolderRepositoryLive,
} from "@/server/repositories/folder-repository";
import {
  NoteRepository,
  NoteRepositoryLive,
} from "@/server/repositories/note-repository";
import {
  TagRepository,
  TagRepositoryLive,
} from "@/server/repositories/tag-repository";
import {
  exportDataSchema,
  exportFolderDataSchema,
  manifestSchema,
} from "@/server/schemas/export-schemas";
import {
  FormatService,
  FormatServiceLive,
} from "@/server/services/format-service";
import { LinkService, LinkServiceLive } from "@/server/services/link-service";

interface ImportResult {
  created: number;
  deleted: number;
  message: string;
  skipped: number;
  success: boolean;
  updated: number;
}

function buildAssetInputs(
  noteId: NoteId,
  userId: string,
  exportedNote: ExportedNote,
  files: Record<string, Uint8Array>,
): CreateAssetInput[] {
  return exportedNote.assets
    .filter((a) => a.path in files)
    .map((a) => {
      return {
        data: Buffer.from(files[a.path]),
        fileName: a.fileName,
        fileSize: a.fileSize,
        height: a.height,
        id: toAssetId(a.id),
        mimeType: a.mimeType,
        noteId,
        userId,
        width: a.width,
      };
    });
}

function buildMessage(
  created: number,
  updated: number,
  skipped: number,
  deleted: number,
) {
  const parts: string[] = [];

  if (created > 0) {
    parts.push(`${String(created)} created`);
  }

  if (updated > 0) {
    parts.push(`${String(updated)} updated`);
  }

  if (skipped > 0) {
    parts.push(`${String(skipped)} skipped`);
  }

  if (deleted > 0) {
    parts.push(`${String(deleted)} deleted`);
  }

  return parts.length > 0 ? parts.join(", ") : "no changes";
}

const FAIL_RESULT: Omit<ImportResult, "message"> = {
  created: 0,
  deleted: 0,
  skipped: 0,
  success: false,
  updated: 0,
};

interface IImportService {
  importZip(
    userId: string,
    zipBuffer: Uint8Array,
    mode: ImportMode,
  ): Effect.Effect<ImportResult>;
}

export class ImportService extends Context.Tag("ImportService")<
  ImportService,
  IImportService
>() {}

const makeImportService = Effect.gen(function* () {
  const noteRepo = yield* NoteRepository;
  const assetRepo = yield* AssetRepository;
  const tagRepo = yield* TagRepository;
  const folderRepo = yield* FolderRepository;
  const formatService = yield* FormatService;
  const linkService = yield* LinkService;

  const importZip = (
    userId: string,
    zipBuffer: Uint8Array,
    mode: ImportMode,
  ) => {
    return Effect.gen(function* () {
      let files: Record<string, Uint8Array>;

      try {
        files = unzipSync(zipBuffer);
      } catch {
        return {
          ...FAIL_RESULT,
          message: "invalid export file: could not read zip archive",
        };
      }

      const decoder = new TextDecoder();
      const manifestRaw = files["manifest.json"] as Uint8Array | undefined;

      if (!manifestRaw) {
        return {
          ...FAIL_RESULT,
          message: "invalid export file: missing manifest.json",
        };
      }

      let manifestParsed: unknown;

      try {
        manifestParsed = JSON.parse(decoder.decode(manifestRaw));
      } catch {
        return {
          ...FAIL_RESULT,
          message: "invalid export file: manifest.json is not valid json",
        };
      }

      const manifestResult = Either.fromOption(
        Schema.decodeUnknownOption(manifestSchema)(manifestParsed),
        () => "invalid manifest",
      );

      if (Either.isLeft(manifestResult)) {
        return {
          ...FAIL_RESULT,
          message: "invalid export file: invalid manifest format",
        };
      }

      const foldersRaw = files["folders.json"] as Uint8Array | undefined;
      const importedFolderIds = new Set<string>();
      const foldersImported = Boolean(foldersRaw);

      if (foldersRaw) {
        let foldersParsed: unknown;

        try {
          foldersParsed = JSON.parse(decoder.decode(foldersRaw));
        } catch {
          return {
            ...FAIL_RESULT,
            message: "invalid export file: folders.json is not valid json",
          };
        }

        const foldersResult = Schema.decodeUnknownOption(
          exportFolderDataSchema,
        )(foldersParsed);

        if (foldersResult._tag === "None") {
          return {
            ...FAIL_RESULT,
            message: "invalid export file: invalid folders format",
          };
        }

        for (const f of foldersResult.value) {
          yield* folderRepo
            .upsert({
              createdAt: new Date(f.createdAt),
              id: toFolderId(f.id),
              name: f.name,
              updatedAt: new Date(f.updatedAt),
              userId,
            })
            .pipe(Effect.orDie);

          importedFolderIds.add(f.id);
        }
      }

      const notesRaw = files["notes.json"] as Uint8Array | undefined;

      if (!notesRaw) {
        return {
          ...FAIL_RESULT,
          message: "invalid export file: missing notes.json",
        };
      }

      let notesParsed: unknown;

      try {
        notesParsed = JSON.parse(decoder.decode(notesRaw));
      } catch {
        return {
          ...FAIL_RESULT,
          message: "invalid export file: notes.json is not valid json",
        };
      }

      const notesResult =
        Schema.decodeUnknownOption(exportDataSchema)(notesParsed);

      if (notesResult._tag === "None") {
        return {
          ...FAIL_RESULT,
          message: "invalid export file: invalid notes format",
        };
      }

      const importedNotes = notesResult.value;

      let created = 0;
      let updated = 0;
      let skipped = 0;

      const importedNoteIds: NoteId[] = [];

      for (const exportedNote of importedNotes) {
        const noteId = toNoteId(exportedNote.id);

        importedNoteIds.push(noteId);

        const existing = yield* noteRepo
          .findById(noteId, userId)
          .pipe(Effect.orDie);
        const importedUpdatedAt = new Date(exportedNote.updatedAt);

        if (existing && existing.updatedAt >= importedUpdatedAt) {
          skipped++;
          continue;
        }

        const formattedContent = yield* formatService.formatMarkdown(
          exportedNote.content,
        );

        const folderId: FolderId | null =
          exportedNote.folderId && importedFolderIds.has(exportedNote.folderId)
            ? toFolderId(exportedNote.folderId)
            : null;

        yield* noteRepo
          .upsert({
            content: formattedContent,
            createdAt: new Date(exportedNote.createdAt),
            folderId,
            id: noteId,
            pinnedAt: exportedNote.pinnedAt
              ? new Date(exportedNote.pinnedAt)
              : null,
            updatedAt: importedUpdatedAt,
            userId,
          })
          .pipe(Effect.orDie);

        yield* assetRepo.deleteByNoteId(noteId, userId).pipe(Effect.orDie);

        const assetInputs = buildAssetInputs(
          noteId,
          userId,
          exportedNote,
          files,
        );

        yield* assetRepo.createMany(assetInputs).pipe(Effect.orDie);

        // Fire-and-forget link sync
        AppRuntime.runFork(
          linkService.syncLinks(userId, noteId, formattedContent),
        );

        const tagIds = yield* tagRepo
          .ensureTags(userId, [...(exportedNote.tags ?? [])])
          .pipe(Effect.orDie);

        yield* noteRepo.syncNoteTags(noteId, tagIds).pipe(Effect.orDie);

        if (existing) {
          updated++;
        } else {
          created++;
        }
      }

      yield* tagRepo.deleteOrphanedTags(userId).pipe(
        Effect.catchTag("DatabaseError", (e) => {
          return Effect.logWarning("deleteOrphanedTags failed after import", e);
        }),
      );

      let deleted = 0;

      if (mode === "mirror") {
        const localIds = yield* noteRepo.findAllIds(userId).pipe(Effect.orDie);
        const importedIdSet = new Set<string>(importedNoteIds);
        const toDelete = localIds.filter((id) => !importedIdSet.has(id));

        if (toDelete.length > 0) {
          yield* noteRepo.deleteMany(toDelete, userId).pipe(Effect.orDie);
          deleted = toDelete.length;
        }

        yield* tagRepo.deleteOrphanedTags(userId).pipe(
          Effect.catchTag("DatabaseError", (e) => {
            return Effect.logWarning(
              "deleteOrphanedTags failed after mirror delete",
              e,
            );
          }),
        );

        if (foldersImported) {
          const allLocalFolders = yield* folderRepo
            .findByUserId(userId)
            .pipe(Effect.orDie);
          const toDeleteFolders = allLocalFolders.filter(
            (f) => !importedFolderIds.has(f.id),
          );

          for (const f of toDeleteFolders) {
            yield* folderRepo
              .delete(toFolderId(f.id), userId)
              .pipe(Effect.orDie);
          }
        }
      }

      yield* noteRepo
        .updateSyncedAt(importedNoteIds, userId)
        .pipe(Effect.orDie);

      return {
        created,
        deleted,
        message: buildMessage(created, updated, skipped, deleted),
        skipped,
        success: true,
        updated,
      };
    });
  };

  return { importZip } satisfies IImportService;
});

export const ImportServiceLive = Layer.effect(
  ImportService,
  makeImportService,
).pipe(
  Layer.provide(
    Layer.mergeAll(
      NoteRepositoryLive,
      AssetRepositoryLive,
      TagRepositoryLive,
      FolderRepositoryLive,
      FormatServiceLive,
      LinkServiceLive,
    ),
  ),
);
