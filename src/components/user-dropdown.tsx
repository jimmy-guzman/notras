import Image from "next/image";
import Link from "next/link";

import { getUser } from "@/lib/get-user";
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
        <button type="submit" className="dsy-btn dsy-btn-ghost">
          Sign In
        </button>
      </form>
    );
  }

  const user = await getUser(session.user.id);

  return (
    <div className="dsy-dropdown dsy-dropdown-end">
      <div
        tabIndex={0}
        role="button"
        className="dsy-avatar dsy-btn dsy-btn-circle dsy-btn-ghost"
      >
        <div className="w-10 rounded-full">
          {session.user.image ? (
            <Image
              alt="avatar"
              src={session.user.image}
              width={40}
              height={40}
            />
          ) : null}
        </div>
      </div>
      <ul
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="dsy-menu dsy-dropdown-content dsy-menu-sm z-[1] mt-3 w-52 rounded-box border border-neutral bg-base-100 p-2 shadow"
      >
        <li className="dsy-menu-title">{user.name}</li>
        <li className="dsy-menu-title">{user.email}</li>
        <span className="dsy-divider my-0" />
        <li>
          <Link href="/settings" className="justify-between">
            <span>Settings</span>
            <span className="icon-[lucide--user-cog]" />
          </Link>
        </li>
        <li>
          <Link href="/settings/theme" className="justify-between">
            <span>Theme</span>
            <span className="dsy-badge dsy-badge-neutral capitalize">
              {user.theme}
            </span>
          </Link>
        </li>
        <span className="dsy-divider my-0" />
        <li>
          <form
            className="grid-cols-1"
            action={async () => {
              "use server";
              await signOut();
            }}
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
