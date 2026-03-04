import type { NoteId } from "@/lib/id";
import type { SelectTag } from "@/server/db/schemas/tags";
import type {
  TagRepository,
  TagWithCount,
} from "@/server/repositories/tag-repository";

import { getDb } from "@/server/db";
import { DBTagRepository } from "@/server/repositories/tag-repository";

class TagService {
  constructor(private tagRepo: TagRepository) {}

  async getAllTags(userId: string): Promise<TagWithCount[]> {
    return this.tagRepo.findByUserId(userId);
  }

  async getTagsForNote(userId: string, noteId: NoteId): Promise<SelectTag[]> {
    return this.tagRepo.findByNoteId(noteId, userId);
  }

  async getTagsForNotes(
    userId: string,
    noteIds: NoteId[],
  ): Promise<Record<string, SelectTag[]>> {
    return this.tagRepo.findByNoteIds(noteIds, userId);
  }

  async syncTags(
    userId: string,
    noteId: NoteId,
    tagNames: string[],
  ): Promise<void> {
    await this.tagRepo.syncTagsForNote(noteId, userId, tagNames);
  }
}

let _tagService: TagService | undefined;

export function getTagService() {
  _tagService ??= new TagService(new DBTagRepository(getDb()));

  return _tagService;
}
