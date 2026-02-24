import { and, eq, notInArray, sql } from "drizzle-orm";

import type { LinkId, NoteId } from "@/lib/id";
import type { Database } from "@/server/db";
import type { SelectLink } from "@/server/db/schemas/links";

import { link } from "@/server/db/schemas/links";

export interface UpsertLinkInput {
  description: null | string;
  id: LinkId;
  noteId: NoteId;
  title: null | string;
  url: string;
  userId: string;
}

export interface LinkRepository {
  deleteByNoteIdExcludingUrls(
    noteId: NoteId,
    userId: string,
    keepUrls: string[],
  ): Promise<void>;
  findByNoteId(noteId: NoteId, userId: string): Promise<SelectLink[]>;
  upsertMany(inputs: UpsertLinkInput[]): Promise<void>;
}

export class DBLinkRepository implements LinkRepository {
  constructor(private db: Database) {}

  async deleteByNoteIdExcludingUrls(
    noteId: NoteId,
    userId: string,
    keepUrls: string[],
  ): Promise<void> {
    if (keepUrls.length === 0) {
      await this.db
        .delete(link)
        .where(and(eq(link.noteId, noteId), eq(link.userId, userId)));

      return;
    }

    await this.db
      .delete(link)
      .where(
        and(
          eq(link.noteId, noteId),
          eq(link.userId, userId),
          notInArray(link.url, keepUrls),
        ),
      );
  }

  async findByNoteId(noteId: NoteId, userId: string): Promise<SelectLink[]> {
    return this.db
      .select()
      .from(link)
      .where(and(eq(link.noteId, noteId), eq(link.userId, userId)));
  }

  async upsertMany(inputs: UpsertLinkInput[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }

    await this.db
      .insert(link)
      .values(
        inputs.map((input) => {
          return {
            createdAt: new Date(),
            description: input.description,
            id: input.id,
            noteId: input.noteId,
            title: input.title,
            url: input.url,
            userId: input.userId,
          };
        }),
      )
      .onConflictDoUpdate({
        set: {
          description: sql`excluded.description`,
          title: sql`excluded.title`,
        },
        target: [link.noteId, link.url],
      });
  }
}
