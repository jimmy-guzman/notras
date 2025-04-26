import Link from "next/link";

import { UserDropdown } from "./user-dropdown";

export const Nav = () => {
  return (
    <nav className="dsy-navbar static w-full lg:sticky lg:top-0 lg:z-30 lg:backdrop-blur">
      <div className="flex-1">
        <Link
          className="dsy-btn dsy-btn-ghost from-primary via-secondary to-accent bg-gradient-to-r bg-clip-text text-xl text-transparent"
          href="/"
        >
          Next.js Starter
        </Link>
      </div>
      <div className="dsy-navbar-end">
        <UserDropdown />
      </div>
    </nav>
  );
};
