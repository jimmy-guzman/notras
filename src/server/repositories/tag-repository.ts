import { and, count, eq, inArray, notExists, notInArray } from "drizzle-orm";

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
    await this.db
      .delete(tag)
      .where(
        and(
          eq(tag.userId, userId),
          notExists(
            this.db
              .select({ tagId: noteTag.tagId })
              .from(noteTag)
              .where(eq(noteTag.tagId, tag.id)),
          ),
        ),
      );
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
    await this.db.transaction(async (tx) => {
      if (tagNames.length === 0) {
        await tx.delete(noteTag).where(eq(noteTag.noteId, noteId));
        await tx
          .delete(tag)
          .where(
            and(
              eq(tag.userId, userId),
              notExists(
                tx
                  .select({ tagId: noteTag.tagId })
                  .from(noteTag)
                  .where(eq(noteTag.tagId, tag.id)),
              ),
            ),
          );

        return;
      }

      const existingRows = await tx
        .select()
        .from(tag)
        .where(and(eq(tag.userId, userId), inArray(tag.name, tagNames)));

      const existingByName = new Map(existingRows.map((r) => [r.name, r.id]));

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

        await tx.insert(tag).values(newRows).onConflictDoNothing();

        const inserted = await tx
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

      await tx
        .delete(noteTag)
        .where(
          and(eq(noteTag.noteId, noteId), notInArray(noteTag.tagId, tagIds)),
        );

      if (tagIds.length > 0) {
        const rows = tagIds.map((tagId) => {
          return { createdAt: new Date(), noteId, tagId };
        });

        await tx.insert(noteTag).values(rows).onConflictDoNothing();
      }

      await tx
        .delete(tag)
        .where(
          and(
            eq(tag.userId, userId),
            notExists(
              tx
                .select({ tagId: noteTag.tagId })
                .from(noteTag)
                .where(eq(noteTag.tagId, tag.id)),
            ),
          ),
        );
    });
  }
}
