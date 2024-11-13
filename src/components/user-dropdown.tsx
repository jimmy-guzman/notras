import Image from "next/image";
import Link from "next/link";

import { getUserByUserId } from "@/lib/get-user-by-user-id";
import { auth, signIn, signOut } from "@/server/auth";

export const UserDropdown = async () => {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn();
        }}
      >
        <button className="dsy-btn dsy-btn-ghost" type="submit">
          Sign In
        </button>
      </form>
    );
  }

  const user = await getUserByUserId(session.user.id);

  return (
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
        className="dsy-menu dsy-dropdown-content dsy-menu-sm z-[1] mt-3 w-52 rounded-box border border-neutral bg-base-100 p-2 shadow"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- TODO: refactor
        tabIndex={0}
      >
        <li className="dsy-menu-title">{user.name}</li>
        <li className="dsy-menu-title">{user.email}</li>
        <span className="dsy-divider my-0" />
        <li>
          <Link className="justify-between" href="/settings">
            <span>Settings</span>
            <span className="icon-[lucide--user-cog]" />
          </Link>
        </li>
        <li>
          <Link className="justify-between" href="/settings/theme">
            <span>Theme</span>
            <span className="dsy-badge dsy-badge-neutral capitalize">
              {user.theme}
            </span>
          </Link>
        </li>
        <span className="dsy-divider my-0" />
        <li>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
            className="grid-cols-1"
          >
            <button className="flex items-center justify-between" type="submit">
              <span>Sign Out</span> <span className="icon-[lucide--log-out]" />
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
};
