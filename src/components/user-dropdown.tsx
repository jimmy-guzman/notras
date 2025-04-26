import Image from "next/image";
import Link from "next/link";

import { getSession } from "@/lib/auth";

import { SignOutButton } from "./sign-out-button";

export const UserDropdown = async () => {
  const session = await getSession();

  return session ? (
    <div className="dsy-dropdown dsy-dropdown-end">
      <div
        className="dsy-avatar dsy-btn dsy-btn-circle dsy-btn-ghost"
        role="button"
        tabIndex={0}
      >
        <div className="h-8 w-8 rounded-full">
          {session.user.image ? (
            <Image
              alt="avatar"
              height={40}
              src={session.user.image}
              width={40}
            />
          ) : null}
        </div>
      </div>
      <ul
        className="dsy-menu dsy-dropdown-content dsy-menu-sm rounded-box border-neutral bg-base-100 z-[1] mt-3 w-52 border p-2 shadow"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- TODO: refactor
        tabIndex={0}
      >
        <li className="dsy-menu-title">{session.user.name}</li>
        <li className="dsy-menu-title">{session.user.email}</li>
        <span className="dsy-divider my-0" />
        <li>
          <Link className="justify-between" href="/settings">
            <span>Settings</span>
            <span className="icon-[lucide--user-cog]" />
          </Link>
        </li>
        <span className="dsy-divider my-0" />
        <li>
          <form className="grid-cols-1">
            <SignOutButton />
          </form>
        </li>
      </ul>
    </div>
  ) : (
    <Link className="dsy-btn dsy-btn-circle dsy-btn-ghost" href="/signin">
      <span className="icon-[lucide--log-in] h-8 w-8" />
    </Link>
  );
};
