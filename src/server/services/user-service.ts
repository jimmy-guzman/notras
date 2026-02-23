import type { UserRepository } from "@/server/repositories/user-repository";

import { db } from "@/server/db";
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
}

let _userService: undefined | UserService;

export function getUserService() {
  _userService ??= new UserService(new DBUserRepository(db));

  return _userService;
}
