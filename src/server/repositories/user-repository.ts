import { eq } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";

import type { Preferences } from "@/server/schemas/user-schemas";

import { Database } from "@/server/db";
import { user } from "@/server/db/schemas/users";
import { DatabaseError } from "@/server/errors";
import { preferencesSchema } from "@/server/schemas/user-schemas";

interface CreateUserInput {
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

interface IUserRepository {
  findFullById(
    id: string,
  ): Effect.Effect<undefined | UserProfile, DatabaseError>;
  findPreferences(id: string): Effect.Effect<Preferences, DatabaseError>;
  update(
    id: string,
    input: UpdateUserInput,
  ): Effect.Effect<void, DatabaseError>;
  updatePreferences(
    id: string,
    preferences: Preferences,
  ): Effect.Effect<void, DatabaseError>;
  upsert(input: CreateUserInput): Effect.Effect<void, DatabaseError>;
}

// ---------------------------------------------------------------------------
// Context tag
// ---------------------------------------------------------------------------

export class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  IUserRepository
>() {}

// ---------------------------------------------------------------------------
// DB implementation
// ---------------------------------------------------------------------------

const makeDbUserRepository = Effect.gen(function* () {
  const db = yield* Database;

  const findFullById = (
    id: string,
  ): Effect.Effect<undefined | UserProfile, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const results = await db
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
      },
    });
  };

  const findPreferences = (
    id: string,
  ): Effect.Effect<Preferences, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: async () => {
        const results = await db
          .select({ preferences: user.preferences })
          .from(user)
          .where(eq(user.id, id))
          .limit(1);

        const raw = results.length > 0 ? results[0].preferences : null;
        const input = raw ? JSON.parse(raw) : {};

        return Schema.decodeUnknownSync(preferencesSchema)(input);
      },
    });
  };

  const update = (
    id: string,
    input: UpdateUserInput,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => db.update(user).set(input).where(eq(user.id, id)),
    });
  };

  const updatePreferences = (
    id: string,
    preferences: Preferences,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => {
        return db
          .update(user)
          .set({
            preferences: JSON.stringify(preferences),
            updatedAt: new Date(),
          })
          .where(eq(user.id, id));
      },
    });
  };

  const upsert = (
    input: CreateUserInput,
  ): Effect.Effect<void, DatabaseError> => {
    return Effect.tryPromise({
      catch: (cause) => new DatabaseError({ cause }),
      try: () => db.insert(user).values(input).onConflictDoNothing(),
    });
  };

  return {
    findFullById,
    findPreferences,
    update,
    updatePreferences,
    upsert,
  } satisfies IUserRepository;
});

export const UserRepositoryLive = Layer.effect(
  UserRepository,
  makeDbUserRepository,
);
