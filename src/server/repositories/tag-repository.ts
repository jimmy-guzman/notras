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
  deleteOrphanedTags(userId: string): Promise<void>;
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

  async deleteOrphanedTags(userId: string): Promise<void> {
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

    // Bulk-fetch all existing tags for this user matching the given names
    const existingRows = await this.db
      .select()
      .from(tag)
      .where(and(eq(tag.userId, userId), inArray(tag.name, tagNames)));

    const existingByName = new Map(existingRows.map((r) => [r.name, r.id]));

    // Determine which names need to be created
    const newNames = tagNames.filter((n) => !existingByName.has(n));

    if (newNames.length > 0) {
      const newRows = newNames.map((name) => {
        return {
          createdAt: new Date(),
          id: generateTagId(),
          name,
          userId,
        };
      });

      await this.db.insert(tag).values(newRows).onConflictDoNothing();

      // Re-fetch just the newly inserted rows to get their IDs
      const inserted = await this.db
        .select()
        .from(tag)
        .where(and(eq(tag.userId, userId), inArray(tag.name, newNames)));

      for (const row of inserted) {
        existingByName.set(row.name, row.id);
      }
    }

    const tagIds = tagNames
      .map((n) => existingByName.get(n))
      .filter((id): id is string => id !== undefined) as TagId[];

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
}
