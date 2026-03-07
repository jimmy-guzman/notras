import { Context, Effect, Layer } from "effect";

import type {
  UpdateUserInput,
  UserProfile,
} from "@/server/repositories/user-repository";
import type { Preferences } from "@/server/schemas/user-schemas";

import { NotFoundError } from "@/server/errors";
import {
  UserRepository,
  UserRepositoryLive,
} from "@/server/repositories/user-repository";

const DEVICE_USER_ID = "device";

interface IUserService {
  getDeviceUserId(): Effect.Effect<string>;
  getPreferences(userId: string): Effect.Effect<Preferences>;
  getProfile(userId: string): Effect.Effect<UserProfile, NotFoundError>;
  updatePreferences(userId: string, data: Preferences): Effect.Effect<void>;
  updateProfile(
    userId: string,
    data: { email: string; name: string },
  ): Effect.Effect<void>;
}

export class UserService extends Context.Tag("UserService")<
  UserService,
  IUserService
>() {}

const makeUserService = Effect.gen(function* () {
  const userRepo = yield* UserRepository;

  const getDeviceUserId = (): Effect.Effect<string> => {
    return Effect.gen(function* () {
      const now = new Date();

      yield* userRepo
        .upsert({
          createdAt: now,
          email: "local@notras.app",
          id: DEVICE_USER_ID,
          name: "You",
          updatedAt: now,
        })
        .pipe(Effect.orDie);

      return DEVICE_USER_ID;
    });
  };

  const getPreferences = (userId: string): Effect.Effect<Preferences> => {
    return userRepo.findPreferences(userId).pipe(Effect.orDie);
  };

  const getProfile = (
    userId: string,
  ): Effect.Effect<UserProfile, NotFoundError> => {
    return Effect.gen(function* () {
      const profile = yield* userRepo.findFullById(userId).pipe(Effect.orDie);

      if (!profile) {
        return yield* Effect.fail(new NotFoundError({ resource: "user" }));
      }

      return profile;
    });
  };

  const updatePreferences = (
    userId: string,
    data: Preferences,
  ): Effect.Effect<void> => {
    return userRepo.updatePreferences(userId, data).pipe(Effect.orDie);
  };

  const updateProfile = (
    userId: string,
    data: { email: string; name: string },
  ): Effect.Effect<void> => {
    const input: UpdateUserInput = {
      ...data,
      updatedAt: new Date(),
    };

    return userRepo.update(userId, input).pipe(Effect.orDie);
  };

  return {
    getDeviceUserId,
    getPreferences,
    getProfile,
    updatePreferences,
    updateProfile,
  } satisfies IUserService;
});

export const UserServiceLive = Layer.effect(UserService, makeUserService).pipe(
  Layer.provide(UserRepositoryLive),
);
