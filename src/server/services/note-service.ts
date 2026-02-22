import type { NoteId } from "@/lib/id";
import type { SelectNote } from "@/server/db/schemas/notes";
import type {
  NoteFilters,
  NoteRepository,
} from "@/server/repositories/note-repository";

import { generateNoteId } from "@/lib/id";
import { db } from "@/server/db";
import { DBNoteRepository } from "@/server/repositories/note-repository";

class NoteService {
  constructor(
    private noteRepo: NoteRepository,
    private idGenerator: () => NoteId = generateNoteId,
  ) {}

  async count(userId: string): Promise<number> {
    return this.noteRepo.count(userId);
  }

  async create(userId: string, content: string): Promise<NoteId> {
    const id = this.idGenerator();

    await this.noteRepo.create({ content, id, userId });

    return id;
  }

  async delete(userId: string, noteId: NoteId): Promise<void> {
    await this.noteRepo.delete(noteId, userId);
  }

  async getById(
    userId: string,
    noteId: NoteId,
  ): Promise<SelectNote | undefined> {
    return this.noteRepo.findById(noteId, userId);
  }

  async list(userId: string, filters: NoteFilters): Promise<SelectNote[]> {
    return this.noteRepo.findMany(userId, filters);
  }

  async pin(userId: string, noteId: NoteId): Promise<void> {
    await this.noteRepo.pin(noteId, userId);
  }

  async unpin(userId: string, noteId: NoteId): Promise<void> {
    await this.noteRepo.unpin(noteId, userId);
  }

  async update(userId: string, noteId: NoteId, content: string): Promise<void> {
    await this.noteRepo.update(noteId, userId, { content });
  }
}

let _noteService: NoteService | undefined;

export function getNoteService() {
  _noteService ??= new NoteService(new DBNoteRepository(db));

  return _noteService;
}
