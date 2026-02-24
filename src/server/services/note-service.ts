import type { NoteId } from "@/lib/id";
import type { SelectNote } from "@/server/db/schemas/notes";
import type {
  NoteFilters,
  NoteRepository,
} from "@/server/repositories/note-repository";

import { generateNoteId } from "@/lib/id";
import { getDb } from "@/server/db";
import { DBNoteRepository } from "@/server/repositories/note-repository";
import { formatMarkdown } from "@/server/services/format-service";

class NoteService {
  constructor(
    private noteRepo: NoteRepository,
    private idGenerator: () => NoteId = generateNoteId,
  ) {}

  async clearReminder(userId: string, noteId: NoteId): Promise<void> {
    await this.noteRepo.clearReminder(noteId, userId);
  }

  async count(userId: string): Promise<number> {
    return this.noteRepo.count(userId);
  }

  async countOverdueReminders(userId: string): Promise<number> {
    return this.noteRepo.countOverdueReminders(userId);
  }

  async create(userId: string, content: string): Promise<NoteId> {
    const id = this.idGenerator();
    const formatted = await formatMarkdown(content);

    await this.noteRepo.create({ content: formatted, id, userId });

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

  async getDueReminders(userId: string): Promise<SelectNote[]> {
    return this.noteRepo.findDueReminders(userId);
  }

  async list(userId: string, filters: NoteFilters): Promise<SelectNote[]> {
    return this.noteRepo.findMany(userId, filters);
  }

  async pin(userId: string, noteId: NoteId): Promise<void> {
    await this.noteRepo.pin(noteId, userId);
  }

  async setReminder(
    userId: string,
    noteId: NoteId,
    remindAt: Date,
  ): Promise<void> {
    await this.noteRepo.setReminder(noteId, userId, remindAt);
  }

  async unpin(userId: string, noteId: NoteId): Promise<void> {
    await this.noteRepo.unpin(noteId, userId);
  }

  async update(userId: string, noteId: NoteId, content: string): Promise<void> {
    const formatted = await formatMarkdown(content);

    await this.noteRepo.update(noteId, userId, { content: formatted });
  }
}

let _noteService: NoteService | undefined;

export function getNoteService() {
  _noteService ??= new NoteService(new DBNoteRepository(getDb()));

  return _noteService;
}
