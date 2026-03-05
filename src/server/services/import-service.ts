import { TextDecoder } from "node:util";

import { unzipSync } from "fflate";

import type { FolderId, NoteId } from "@/lib/id";
import type {
  AssetRepository,
  CreateAssetInput,
} from "@/server/repositories/asset-repository";
import type { FolderRepository } from "@/server/repositories/folder-repository";
import type { NoteRepository } from "@/server/repositories/note-repository";
import type { TagRepository } from "@/server/repositories/tag-repository";
import type { ExportedNote, ImportMode } from "@/server/schemas/export-schemas";

import { toAssetId, toFolderId, toNoteId } from "@/lib/id";
import { getDb } from "@/server/db";
import { DBAssetRepository } from "@/server/repositories/asset-repository";
import { DBFolderRepository } from "@/server/repositories/folder-repository";
import { DBNoteRepository } from "@/server/repositories/note-repository";
import { DBTagRepository } from "@/server/repositories/tag-repository";
import {
  exportDataSchema,
  exportFolderDataSchema,
  manifestSchema,
} from "@/server/schemas/export-schemas";
import { formatMarkdown } from "@/server/services/format-service";
import { getLinkService } from "@/server/services/link-service";

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

class ImportService {
  constructor(
    private noteRepo: NoteRepository,
    private assetRepo: AssetRepository,
    private tagRepo: TagRepository,
    private folderRepo: FolderRepository,
  ) {}

  async importZip(
    userId: string,
    zipBuffer: Uint8Array,
    mode: ImportMode,
  ): Promise<ImportResult> {
    const files = unzipSync(zipBuffer);
    const decoder = new TextDecoder();
    const manifestRaw = files["manifest.json"] as Uint8Array | undefined;

    if (!manifestRaw) {
      return {
        ...FAIL_RESULT,
        message: "invalid export file: missing manifest.json",
      };
    }

    const manifestResult = manifestSchema.safeParse(
      JSON.parse(decoder.decode(manifestRaw)),
    );

    if (!manifestResult.success) {
      return {
        ...FAIL_RESULT,
        message: "invalid export file: invalid manifest format",
      };
    }

    // Restore folders first so that note folderId FKs resolve.
    const foldersRaw = files["folders.json"] as Uint8Array | undefined;
    const importedFolderIds = new Set<string>();

    if (foldersRaw) {
      const foldersResult = exportFolderDataSchema.safeParse(
        JSON.parse(decoder.decode(foldersRaw)),
      );

      if (foldersResult.success) {
        for (const f of foldersResult.data) {
          await this.folderRepo.upsert({
            createdAt: new Date(f.createdAt),
            id: toFolderId(f.id),
            name: f.name,
            updatedAt: new Date(f.updatedAt),
            userId,
          });

          importedFolderIds.add(f.id);
        }
      }
    }

    const notesRaw = files["notes.json"] as Uint8Array | undefined;

    if (!notesRaw) {
      return {
        ...FAIL_RESULT,
        message: "invalid export file: missing notes.json",
      };
    }

    const notesResult = exportDataSchema.safeParse(
      JSON.parse(decoder.decode(notesRaw)),
    );

    if (!notesResult.success) {
      return {
        ...FAIL_RESULT,
        message: "invalid export file: invalid notes format",
      };
    }

    const importedNotes = notesResult.data;

    let created = 0;
    let updated = 0;
    let skipped = 0;

    const importedNoteIds: NoteId[] = [];

    for (const exportedNote of importedNotes) {
      const noteId = toNoteId(exportedNote.id);

      importedNoteIds.push(noteId);

      const existing = await this.noteRepo.findById(noteId, userId);
      const importedUpdatedAt = new Date(exportedNote.updatedAt);

      if (existing && existing.updatedAt >= importedUpdatedAt) {
        skipped++;
        continue;
      }

      const formattedContent = await formatMarkdown(exportedNote.content);

      // Only assign folderId if the folder was actually imported/exists.
      const folderId: FolderId | null =
        exportedNote.folderId && importedFolderIds.has(exportedNote.folderId)
          ? toFolderId(exportedNote.folderId)
          : null;

      await this.noteRepo.upsert({
        content: formattedContent,
        createdAt: new Date(exportedNote.createdAt),
        folderId,
        id: noteId,
        pinnedAt: exportedNote.pinnedAt
          ? new Date(exportedNote.pinnedAt)
          : null,
        updatedAt: importedUpdatedAt,
        userId,
      });

      await this.assetRepo.deleteByNoteId(noteId, userId);

      const assetInputs = buildAssetInputs(noteId, userId, exportedNote, files);

      await this.assetRepo.createMany(assetInputs);

      void getLinkService().syncLinks(userId, noteId, formattedContent);
      await this.tagRepo.syncTagsForNote(
        noteId,
        userId,
        exportedNote.tags ?? [],
      );

      if (existing) {
        updated++;
      } else {
        created++;
      }
    }

    let deleted = 0;

    if (mode === "mirror") {
      const localIds = await this.noteRepo.findAllIds(userId);
      const importedIdSet = new Set<string>(importedNoteIds);
      const toDelete = localIds.filter((id) => !importedIdSet.has(id));

      if (toDelete.length > 0) {
        await this.noteRepo.deleteMany(toDelete, userId);
        deleted = toDelete.length;
      }

      await this.tagRepo.deleteOrphanedTags(userId);

      // In mirror mode, delete folders not present in the import.
      const allLocalFolders = await this.folderRepo.findByUserId(userId);
      const toDeleteFolders = allLocalFolders.filter(
        (f) => !importedFolderIds.has(f.id),
      );

      for (const f of toDeleteFolders) {
        await this.folderRepo.delete(toFolderId(f.id), userId);
      }
    }

    await this.noteRepo.updateSyncedAt(importedNoteIds, userId);

    return {
      created,
      deleted,
      message: buildMessage(created, updated, skipped, deleted),
      skipped,
      success: true,
      updated,
    };
  }
}

let _importService: ImportService | undefined;

export function getImportService() {
  _importService ??= new ImportService(
    new DBNoteRepository(getDb()),
    new DBAssetRepository(getDb()),
    new DBTagRepository(getDb()),
    new DBFolderRepository(getDb()),
  );

  return _importService;
}
