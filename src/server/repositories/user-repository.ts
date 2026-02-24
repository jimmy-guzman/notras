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

export interface UpdateUserInput {
  email: string;
  name: string;
  updatedAt: Date;
}

export interface UserProfile {
  email: string;
  id: string;
  image: null | string;
  name: string;
}

export interface UserRepository {
  findFullById(id: string): Promise<undefined | UserProfile>;
  update(id: string, input: UpdateUserInput): Promise<void>;
  upsert(input: CreateUserInput): Promise<void>;
}

export class DBUserRepository implements UserRepository {
  constructor(private db: Database) {}

  async findFullById(id: string): Promise<undefined | UserProfile> {
    const results = await this.db
      .select({
        email: user.email,
        id: user.id,
        image: user.image,
        name: user.name,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    return results.length > 0 ? results[0] : undefined;
  }

  async update(id: string, input: UpdateUserInput): Promise<void> {
    await this.db.update(user).set(input).where(eq(user.id, id));
  }

  async upsert(input: CreateUserInput): Promise<void> {
    await this.db.insert(user).values(input).onConflictDoNothing();
  }
}
