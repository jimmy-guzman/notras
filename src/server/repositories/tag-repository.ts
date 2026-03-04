import { and, count, eq, inArray, notInArray } from "drizzle-orm";

import type { NoteId, TagId } from "@/lib/id";
import type { Database } from "@/server/db";
import type { SelectTag } from "@/server/db/schemas/tags";

import { generateTagId } from "@/lib/id";
import { noteTag, tag } from "@/server/db/schemas/tags";

export interface TagWithCount extends SelectTag {
  noteCount: number;
}

export interface TagRepository {
  findByNoteId(noteId: NoteId, userId: string): Promise<SelectTag[]>;
  findByNoteIds(
    noteIds: NoteId[],
    userId: string,
  ): Promise<Record<string, SelectTag[]>>;
  findByUserId(userId: string): Promise<TagWithCount[]>;
  syncTagsForNote(
    noteId: NoteId,
    userId: string,
    tagNames: string[],
  ): Promise<void>;
}

export class DBTagRepository implements TagRepository {
  constructor(private db: Database) {}

  async findByNoteId(noteId: NoteId, userId: string): Promise<SelectTag[]> {
    const rows = await this.db
      .select({ tag })
      .from(noteTag)
      .innerJoin(tag, eq(noteTag.tagId, tag.id))
      .where(and(eq(noteTag.noteId, noteId), eq(tag.userId, userId)));

    return rows.map((r) => r.tag);
  }

  async findByNoteIds(
    noteIds: NoteId[],
    userId: string,
  ): Promise<Record<string, SelectTag[]>> {
    if (noteIds.length === 0) {
      return {};
    }

    const rows = await this.db
      .select({ noteId: noteTag.noteId, tag })
      .from(noteTag)
      .innerJoin(tag, eq(noteTag.tagId, tag.id))
      .where(and(inArray(noteTag.noteId, noteIds), eq(tag.userId, userId)));

    const result: Record<string, SelectTag[]> = {};

    for (const row of rows) {
      const existing = result[row.noteId] ?? [];

      existing.push(row.tag);
      result[row.noteId] = existing;
    }

    return result;
  }

  async findByUserId(userId: string): Promise<TagWithCount[]> {
    const rows = await this.db
      .select({ noteCount: count(noteTag.noteId), tag })
      .from(tag)
      .leftJoin(noteTag, eq(noteTag.tagId, tag.id))
      .where(eq(tag.userId, userId))
      .groupBy(tag.id);

    return rows.map((r) => ({ ...r.tag, noteCount: r.noteCount }));
  }

  async syncTagsForNote(
    noteId: NoteId,
    userId: string,
    tagNames: string[],
  ): Promise<void> {
    if (tagNames.length === 0) {
      // Remove all tags for this note
      await this.db.delete(noteTag).where(eq(noteTag.noteId, noteId));
      await this.deleteOrphanedTags(userId);

      return;
    }

    // Upsert each tag by name for this user
    const tagIds: TagId[] = [];

    for (const name of tagNames) {
      const existing = await this.db
        .select()
        .from(tag)
        .where(and(eq(tag.name, name), eq(tag.userId, userId)))
        .limit(1);

      if (existing.length > 0 && existing[0]) {
        tagIds.push(existing[0].id as TagId);
      } else {
        const id = generateTagId() as TagId;

        await this.db.insert(tag).values({
          createdAt: new Date(),
          id,
          name,
          userId,
        });
        tagIds.push(id);
      }
    }

    // Remove note_tag rows for tags no longer on this note
    await this.db
      .delete(noteTag)
      .where(
        and(eq(noteTag.noteId, noteId), notInArray(noteTag.tagId, tagIds)),
      );

    // Insert new note_tag rows (ignore conflicts — composite PK prevents dupes)
    for (const tagId of tagIds) {
      await this.db
        .insert(noteTag)
        .values({ createdAt: new Date(), noteId, tagId })
        .onConflictDoNothing();
    }

    // Clean up any tags that have no notes left
    await this.deleteOrphanedTags(userId);
  }

  private async deleteOrphanedTags(userId: string): Promise<void> {
    // Find tag IDs that still have at least one note_tag row
    const usedTagRows = await this.db
      .selectDistinct({ tagId: noteTag.tagId })
      .from(noteTag)
      .innerJoin(tag, eq(noteTag.tagId, tag.id))
      .where(eq(tag.userId, userId));

    const usedTagIds = usedTagRows.map((r) => r.tagId);

    await (usedTagIds.length > 0
      ? this.db
          .delete(tag)
          .where(and(eq(tag.userId, userId), notInArray(tag.id, usedTagIds)))
      : this.db.delete(tag).where(eq(tag.userId, userId)));
  }
}
