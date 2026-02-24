import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  sql,
} from "drizzle-orm";

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
  remind?: "overdue" | "upcoming";
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

export interface UpsertNoteInput {
  content: string;
  createdAt: Date;
  id: NoteId;
  pinnedAt: Date | null;
  updatedAt: Date;
  userId: string;
}

export interface NoteRepository {
  clearReminder(noteId: NoteId, userId: string): Promise<void>;
  count(userId: string): Promise<number>;
  countOverdueReminders(userId: string): Promise<number>;
  create(input: CreateNoteInput): Promise<void>;
  delete(noteId: NoteId, userId: string): Promise<void>;
  deleteMany(noteIds: NoteId[], userId: string): Promise<void>;
  findAllIds(userId: string): Promise<NoteId[]>;
  findById(noteId: NoteId, userId: string): Promise<SelectNote | undefined>;
  findDueReminders(userId: string): Promise<SelectNote[]>;
  findMany(userId: string, filters: NoteFilters): Promise<SelectNote[]>;
  pin(noteId: NoteId, userId: string): Promise<void>;
  setReminder(noteId: NoteId, userId: string, remindAt: Date): Promise<void>;
  unpin(noteId: NoteId, userId: string): Promise<void>;
  update(noteId: NoteId, userId: string, input: UpdateNoteInput): Promise<void>;
  updateSyncedAt(noteIds: NoteId[], userId: string): Promise<void>;
  upsert(input: UpsertNoteInput): Promise<void>;
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

  async clearReminder(noteId: NoteId, userId: string): Promise<void> {
    await this.db
      .update(note)
      .set({ remindAt: null, updatedAt: new Date() })
      .where(and(eq(note.id, noteId), eq(note.userId, userId)));
  }

  async count(userId: string): Promise<number> {
    const [{ count: notesCount }] = await this.db
      .select({ count: count() })
      .from(note)
      .where(eq(note.userId, userId));

    return notesCount;
  }

  async countOverdueReminders(userId: string): Promise<number> {
    const [{ count: c }] = await this.db
      .select({ count: count() })
      .from(note)
      .where(
        and(
          eq(note.userId, userId),
          isNotNull(note.remindAt),
          lte(note.remindAt, new Date()),
        ),
      );

    return c;
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

  async deleteMany(noteIds: NoteId[], userId: string): Promise<void> {
    if (noteIds.length === 0) {
      return;
    }

    await this.db
      .delete(note)
      .where(and(inArray(note.id, noteIds), eq(note.userId, userId)));
  }

  async findAllIds(userId: string): Promise<NoteId[]> {
    const results = await this.db
      .select({ id: note.id })
      .from(note)
      .where(eq(note.userId, userId));

    return results.map((r) => r.id as NoteId);
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

  async findDueReminders(userId: string): Promise<SelectNote[]> {
    return this.db
      .select()
      .from(note)
      .where(
        and(
          eq(note.userId, userId),
          isNotNull(note.remindAt),
          lte(note.remindAt, new Date()),
        ),
      )
      .orderBy(asc(note.remindAt));
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

    const remindFilter =
      filters.remind === "overdue"
        ? [isNotNull(note.remindAt), lte(note.remindAt, new Date())]
        : filters.remind === "upcoming"
          ? [isNotNull(note.remindAt), gt(note.remindAt, new Date())]
          : [];

    const qb = this.db
      .select()
      .from(note)
      .where(
        and(
          ...baseFilters,
          ...pinnedFilter,
          ...queryFilter,
          ...timeFilter,
          ...remindFilter,
        ),
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

  async setReminder(
    noteId: NoteId,
    userId: string,
    remindAt: Date,
  ): Promise<void> {
    await this.db
      .update(note)
      .set({ remindAt, updatedAt: new Date() })
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

  async updateSyncedAt(noteIds: NoteId[], userId: string): Promise<void> {
    if (noteIds.length === 0) {
      return;
    }

    await this.db
      .update(note)
      .set({ syncedAt: new Date() })
      .where(and(inArray(note.id, noteIds), eq(note.userId, userId)));
  }

  async upsert(input: UpsertNoteInput): Promise<void> {
    await this.db
      .insert(note)
      .values({
        content: input.content,
        createdAt: input.createdAt,
        id: input.id,
        pinnedAt: input.pinnedAt,
        updatedAt: input.updatedAt,
        userId: input.userId,
      })
      .onConflictDoUpdate({
        set: {
          content: input.content,
          pinnedAt: input.pinnedAt,
          updatedAt: input.updatedAt,
        },
        target: note.id,
        where: sql`${note.updatedAt} < ${input.updatedAt.getTime() / 1000}`,
      });
  }
}
