import { eq } from "drizzle-orm";

import type { Database } from "@/server/db";

import { user } from "@/server/db/schemas/users";

export interface CreateUserInput {
  createdAt: Date;
  email: string;
  id: string;
  name: string;
  updatedAt: Date;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<void>;
  findById(id: string): Promise<undefined | { id: string }>;
}

export class DBUserRepository implements UserRepository {
  constructor(private db: Database) {}

  async create(input: CreateUserInput): Promise<void> {
    await this.db.insert(user).values(input);
  }

  async findById(id: string): Promise<undefined | { id: string }> {
    const results = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    return results.length > 0 ? results[0] : undefined;
  }
}
