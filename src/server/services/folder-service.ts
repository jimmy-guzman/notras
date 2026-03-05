import type { FolderId, NoteId } from "@/lib/id";
import type { SelectFolder } from "@/server/db/schemas/folders";
import type {
  FolderRepository,
  FolderWithCount,
} from "@/server/repositories/folder-repository";
import type { NoteRepository } from "@/server/repositories/note-repository";

import { generateFolderId } from "@/lib/id";
import { getDb } from "@/server/db";
import { DBFolderRepository } from "@/server/repositories/folder-repository";
import { DBNoteRepository } from "@/server/repositories/note-repository";

class FolderService {
  constructor(
    private folderRepo: FolderRepository,
    private noteRepo: NoteRepository,
    private idGenerator: () => FolderId = generateFolderId,
  ) {}

  async create(userId: string, name: string): Promise<FolderId> {
    const id = this.idGenerator();

    await this.folderRepo.create({ id, name, userId });

    return id;
  }

  async delete(userId: string, folderId: FolderId): Promise<void> {
    await this.folderRepo.delete(folderId, userId);
  }

  async getAll(userId: string): Promise<FolderWithCount[]> {
    return this.folderRepo.findByUserId(userId);
  }

  async getById(
    userId: string,
    folderId: FolderId,
  ): Promise<SelectFolder | undefined> {
    return this.folderRepo.findById(folderId, userId);
  }

  async move(
    userId: string,
    noteId: NoteId,
    folderId: FolderId | null,
  ): Promise<void> {
    await this.noteRepo.moveToFolder(noteId, userId, folderId);
  }

  async rename(
    userId: string,
    folderId: FolderId,
    name: string,
  ): Promise<void> {
    await this.folderRepo.rename(folderId, userId, name);
  }
}

let _folderService: FolderService | undefined;

export function getFolderService() {
  _folderService ??= new FolderService(
    new DBFolderRepository(getDb()),
    new DBNoteRepository(getDb()),
  );

  return _folderService;
}
