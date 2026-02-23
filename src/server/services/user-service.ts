import type {
  UserProfile,
  UserRepository,
} from "@/server/repositories/user-repository";

import { getDb } from "@/server/db";
import { DBUserRepository } from "@/server/repositories/user-repository";

const DEVICE_USER_ID = "device";

class UserService {
  constructor(private userRepo: UserRepository) {}

  async getDeviceUserId(): Promise<string> {
    const existing = await this.userRepo.findById(DEVICE_USER_ID);

    if (existing) {
      return existing.id;
    }

    const now = new Date();

    await this.userRepo.create({
      createdAt: now,
      email: "local@notras.app",
      id: DEVICE_USER_ID,
      name: "You",
      updatedAt: now,
    });

    return DEVICE_USER_ID;
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const profile = await this.userRepo.findFullById(userId);

    if (!profile) {
      throw new Error("User not found");
    }

    return profile;
  }

  async updateProfile(
    userId: string,
    data: { email: string; name: string },
  ): Promise<void> {
    await this.userRepo.update(userId, {
      ...data,
      updatedAt: new Date(),
    });
  }
}

let _userService: undefined | UserService;

export function getUserService() {
  _userService ??= new UserService(new DBUserRepository(getDb()));

  return _userService;
}
