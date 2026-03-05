import { and, count, eq } from "drizzle-orm";

import type { FolderId } from "@/lib/id";
import type { Database } from "@/server/db";
import type { SelectFolder } from "@/server/db/schemas/folders";

import { folder } from "@/server/db/schemas/folders";
import { note } from "@/server/db/schemas/notes";

export interface FolderWithCount extends SelectFolder {
  noteCount: number;
}

export interface CreateFolderInput {
  id: FolderId;
  name: string;
  userId: string;
}

export interface UpsertFolderInput {
  createdAt: Date;
  id: FolderId;
  name: string;
  updatedAt: Date;
  userId: string;
}

export interface FolderRepository {
  create(input: CreateFolderInput): Promise<void>;
  delete(folderId: FolderId, userId: string): Promise<void>;
  deleteAllByUserId(userId: string): Promise<void>;
  findById(
    folderId: FolderId,
    userId: string,
  ): Promise<SelectFolder | undefined>;
  findByUserId(userId: string): Promise<FolderWithCount[]>;
  rename(folderId: FolderId, userId: string, name: string): Promise<void>;
  upsert(input: UpsertFolderInput): Promise<void>;
}

export class DBFolderRepository implements FolderRepository {
  constructor(private db: Database) {}

  async create(input: CreateFolderInput): Promise<void> {
    await this.db.insert(folder).values({
      createdAt: new Date(),
      id: input.id,
      name: input.name,
      updatedAt: new Date(),
      userId: input.userId,
    });
  }

  async delete(folderId: FolderId, userId: string): Promise<void> {
    await this.db
      .delete(folder)
      .where(and(eq(folder.id, folderId), eq(folder.userId, userId)));
  }

  async deleteAllByUserId(userId: string): Promise<void> {
    await this.db.delete(folder).where(eq(folder.userId, userId));
  }

  async findById(
    folderId: FolderId,
    userId: string,
  ): Promise<SelectFolder | undefined> {
    const results = await this.db
      .select()
      .from(folder)
      .where(and(eq(folder.id, folderId), eq(folder.userId, userId)))
      .limit(1);

    return results.length > 0 ? results[0] : undefined;
  }

  async findByUserId(userId: string): Promise<FolderWithCount[]> {
    const results = await this.db
      .select({
        createdAt: folder.createdAt,
        id: folder.id,
        name: folder.name,
        noteCount: count(note.id),
        updatedAt: folder.updatedAt,
        userId: folder.userId,
      })
      .from(folder)
      .leftJoin(
        note,
        and(eq(note.folderId, folder.id), eq(note.userId, userId)),
      )
      .where(eq(folder.userId, userId))
      .groupBy(folder.id)
      .orderBy(folder.name);

    return results;
  }

  async rename(
    folderId: FolderId,
    userId: string,
    name: string,
  ): Promise<void> {
    await this.db
      .update(folder)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(folder.id, folderId), eq(folder.userId, userId)));
  }

  async upsert(input: UpsertFolderInput): Promise<void> {
    await this.db
      .insert(folder)
      .values({
        createdAt: input.createdAt,
        id: input.id,
        name: input.name,
        updatedAt: input.updatedAt,
        userId: input.userId,
      })
      .onConflictDoUpdate({
        set: {
          name: input.name,
          updatedAt: input.updatedAt,
        },
        target: folder.id,
      });
  }
}
