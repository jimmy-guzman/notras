import { and, asc, count, desc, eq, gte, isNull, like, sql } from "drizzle-orm";

import type { NoteId } from "@/lib/id";
import type { SortOption, TimeFilter } from "@/lib/utils/note-filters";
import type { Database } from "@/server/db";
import type { SelectNote } from "@/server/db/schemas/notes";

import { getStartDateForFilter } from "@/lib/utils/note-filters";
import { note } from "@/server/db/schemas/notes";

export interface NoteFilters {
  excludePinned?: boolean;
  limit?: number;
  query?: string;
  sort?: SortOption;
  time?: "all" | TimeFilter;
}

export interface CreateNoteInput {
  content: string;
  id: NoteId;
  userId: string;
}

export interface UpdateNoteInput {
  content: string;
}

export interface NoteRepository {
  count(userId: string): Promise<number>;
  create(input: CreateNoteInput): Promise<void>;
  delete(noteId: NoteId, userId: string): Promise<void>;
  findById(noteId: NoteId, userId: string): Promise<SelectNote | undefined>;
  findMany(userId: string, filters: NoteFilters): Promise<SelectNote[]>;
  pin(noteId: NoteId, userId: string): Promise<void>;
  unpin(noteId: NoteId, userId: string): Promise<void>;
  update(noteId: NoteId, userId: string, input: UpdateNoteInput): Promise<void>;
}

const pinnedFirst = asc(
  sql`CASE WHEN ${note.pinnedAt} IS NOT NULL THEN 0 ELSE 1 END`,
);

function getSortOrder(sort: NoteFilters["sort"] = "newest") {
  switch (sort) {
    case "newest": {
      return [pinnedFirst, desc(note.createdAt)];
    }
    case "oldest": {
      return [pinnedFirst, asc(note.createdAt)];
    }
    case "updated": {
      return [pinnedFirst, desc(note.updatedAt)];
    }
    default: {
      return [pinnedFirst, desc(note.createdAt)];
    }
  }
}

export class DBNoteRepository implements NoteRepository {
  constructor(private db: Database) {}

  async count(userId: string): Promise<number> {
    const [{ count: notesCount }] = await this.db
      .select({ count: count() })
      .from(note)
      .where(eq(note.userId, userId));

    return notesCount;
  }

  async create(input: CreateNoteInput): Promise<void> {
    await this.db.insert(note).values({
      content: input.content,
      createdAt: new Date(),
      id: input.id,
      updatedAt: new Date(),
      userId: input.userId,
    });
  }

  async delete(noteId: NoteId, userId: string): Promise<void> {
    await this.db
      .delete(note)
      .where(and(eq(note.id, noteId), eq(note.userId, userId)));
  }

  async findById(
    noteId: NoteId,
    userId: string,
  ): Promise<SelectNote | undefined> {
    const results = await this.db
      .select()
      .from(note)
      .where(and(eq(note.id, noteId), eq(note.userId, userId)))
      .limit(1);

    return results.length > 0 ? results[0] : undefined;
  }

  async findMany(userId: string, filters: NoteFilters): Promise<SelectNote[]> {
    const baseFilters = [eq(note.userId, userId)];

    const pinnedFilter = filters.excludePinned ? [isNull(note.pinnedAt)] : [];

    const queryFilter = filters.query
      ? [like(note.content, `%${filters.query}%`)]
      : [];

    const timeFilter =
      !filters.time || filters.time === "all"
        ? []
        : [gte(note.createdAt, getStartDateForFilter(filters.time))];

    const qb = this.db
      .select()
      .from(note)
      .where(
        and(...baseFilters, ...pinnedFilter, ...queryFilter, ...timeFilter),
      )
      .orderBy(...getSortOrder(filters.sort));

    if (filters.limit) {
      return qb.limit(filters.limit);
    }

    return qb;
  }

  async pin(noteId: NoteId, userId: string): Promise<void> {
    await this.db
      .update(note)
      .set({ pinnedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(note.id, noteId), eq(note.userId, userId)));
  }

  async unpin(noteId: NoteId, userId: string): Promise<void> {
    await this.db
      .update(note)
      .set({ pinnedAt: null, updatedAt: new Date() })
      .where(and(eq(note.id, noteId), eq(note.userId, userId)));
  }

  async update(
    noteId: NoteId,
    userId: string,
    input: UpdateNoteInput,
  ): Promise<void> {
    await this.db
      .update(note)
      .set({ content: input.content, updatedAt: new Date() })
      .where(and(eq(note.id, noteId), eq(note.userId, userId)));
  }
}
