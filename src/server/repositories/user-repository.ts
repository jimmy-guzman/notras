import { eq } from "drizzle-orm";

import type { Database } from "@/server/db";
import type { Preferences } from "@/server/schemas/user-schemas";

import { user } from "@/server/db/schemas/users";
import { preferencesSchema } from "@/server/schemas/user-schemas";

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
  findPreferences(id: string): Promise<Preferences>;
  update(id: string, input: UpdateUserInput): Promise<void>;
  updatePreferences(id: string, preferences: Preferences): Promise<void>;
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

  async findPreferences(id: string): Promise<Preferences> {
    const results = await this.db
      .select({ preferences: user.preferences })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    const raw = results.length > 0 ? results[0].preferences : null;

    if (!raw) {
      return preferencesSchema.parse({});
    }

    return preferencesSchema.parse(JSON.parse(raw));
  }

  async update(id: string, input: UpdateUserInput): Promise<void> {
    await this.db.update(user).set(input).where(eq(user.id, id));
  }

  async updatePreferences(id: string, preferences: Preferences): Promise<void> {
    await this.db
      .update(user)
      .set({ preferences: JSON.stringify(preferences), updatedAt: new Date() })
      .where(eq(user.id, id));
  }

  async upsert(input: CreateUserInput): Promise<void> {
    await this.db.insert(user).values(input).onConflictDoNothing();
  }
}
